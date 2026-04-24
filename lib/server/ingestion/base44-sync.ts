import { createServiceClient } from "@/lib/supabase/service";
import { listBase44Leads } from "@/lib/integrations/base44";
import {
  getBase44CategoryCandidates,
  mapBase44LeadToInventoryLead,
  translateBase44CategoryToEnglish,
} from "@/lib/integrations/base44-mapper";

const PROVIDER = "base44";

function getBatchSize() {
  const raw = Number(process.env.BASE44_INGEST_BATCH_SIZE ?? 100);
  if (!Number.isFinite(raw) || raw <= 0) return 100;
  return Math.min(Math.floor(raw), 500);
}

function getDefaultCategoryId() {
  const id = process.env.BASE44_DEFAULT_CATEGORY_ID?.trim();
  return id && id.length > 0 ? id : null;
}

function pickCategoryLabel(candidates: string[]) {
  if (candidates.length === 0) return "general-insurance";
  return candidates[0];
}

export type Base44SyncResult = {
  fetched: number;
  inserted: number;
  updated: number;
  skipped_invalid: number;
  skip_reasons: Record<string, number>;
  next_skip: number;
  cursor_updated_at: string | null;
};

type SyncedLeadRow = {
  id: string;
  created_at: string;
  updated_at: string;
  category_id: string;
  source_updated_at: string | null;
};

export async function runBase44SyncOnce(): Promise<Base44SyncResult> {
  const service = createServiceClient();
  const batchSize = getBatchSize();
  const defaultCategoryId = getDefaultCategoryId();
  const { data: categoryRows, error: categoryError } = await service
    .from("categories")
    .select("id,name,slug");
  if (categoryError) {
    throw new Error(`Failed to load categories: ${categoryError.message}`);
  }
  const categoryBySlug = new Map<string, { id: string; name: string; slug: string }>();
  for (const row of categoryRows ?? []) {
    const slug = String(row.slug ?? "").trim().toLowerCase();
    if (!slug) continue;
    categoryBySlug.set(slug, {
      id: String(row.id),
      name: String(row.name ?? ""),
      slug,
    });
  }

  const { data: cursorRow } = await service
    .from("external_sync_cursors")
    .select("provider,last_synced_at")
    .eq("provider", PROVIDER)
    .maybeSingle();

  let inserted = 0;
  let updated = 0;
  let skippedInvalid = 0;
  const skipReasons = new Map<string, number>();
  let latestSourceUpdatedAt: string | null = cursorRow?.last_synced_at ?? null;
  let fetched = 0;
  let skip = 0;
  const maxPages = 50;

  const addSkipReason = (reason: string) => {
    skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1);
  };

  for (let page = 0; page < maxPages; page += 1) {
    const pageRows = await listBase44Leads({
      limit: batchSize,
      skip,
      sortBy: "created_date",
    });
    if (pageRows.length === 0) break;
    fetched += pageRows.length;

    for (const raw of pageRows) {
      const candidates = getBase44CategoryCandidates(raw);
      const primaryLabel = pickCategoryLabel(candidates);
      const translated = translateBase44CategoryToEnglish(primaryLabel);

      let mappedCategoryId = categoryBySlug.get(translated.slug)?.id ?? null;
      if (!mappedCategoryId) {
        const created = await service
          .from("categories")
          .insert({
            name: translated.name,
            slug: translated.slug,
            source_system: PROVIDER,
            source_external_value: primaryLabel,
          })
          .select("id,name,slug")
          .single();

        if (!created.error && created.data) {
          const createdSlug = String(created.data.slug ?? "").trim().toLowerCase();
          if (createdSlug) {
            categoryBySlug.set(createdSlug, {
              id: String(created.data.id),
              name: String(created.data.name ?? ""),
              slug: createdSlug,
            });
          }
          mappedCategoryId = String(created.data.id);
        }
      }

      mappedCategoryId = mappedCategoryId ?? defaultCategoryId;
      if (!mappedCategoryId) {
        skippedInvalid += 1;
        addSkipReason("missing_category");
        continue;
      }

      const mapped = mapBase44LeadToInventoryLead(raw, mappedCategoryId);
      if (!mapped.ok) {
        skippedInvalid += 1;
        addSkipReason(`validation:${mapped.reason}`);
        continue;
      }

      const payload = mapped.data;
      const existing = await service
        .from("leads")
        .select("id")
        .eq("source_system", payload.source_system)
        .eq("source_external_id", payload.source_external_id)
        .maybeSingle();
      if (existing.error) {
        skippedInvalid += 1;
        addSkipReason(`lookup:${existing.error.message}`);
        continue;
      }

      let upserted: SyncedLeadRow | null = null;

      if (existing.data?.id) {
        const updateRes = await service
          .from("leads")
          .update(payload)
          .eq("id", existing.data.id)
          .select("id,created_at,updated_at,category_id,source_updated_at")
          .single();
        if (updateRes.error) {
          skippedInvalid += 1;
          addSkipReason(`update:${updateRes.error.message}`);
          continue;
        }
        upserted = updateRes.data as SyncedLeadRow;
        updated += 1;
      } else {
        const insertRes = await service
          .from("leads")
          .insert(payload)
          .select("id,created_at,updated_at,category_id,source_updated_at")
          .single();
        if (insertRes.error) {
          skippedInvalid += 1;
          addSkipReason(`insert:${insertRes.error.message}`);
          continue;
        }
        upserted = insertRes.data as SyncedLeadRow;
        inserted += 1;
      }
      if (!upserted) {
        skippedInvalid += 1;
        addSkipReason("upsert:no_result");
        continue;
      }

      const sourceUpdatedAt = upserted.source_updated_at;
      if (sourceUpdatedAt && (!latestSourceUpdatedAt || sourceUpdatedAt > latestSourceUpdatedAt)) {
        latestSourceUpdatedAt = sourceUpdatedAt;
      }

      const ingestKey = `base44:${String(payload.source_external_id)}`;
      const runJob = await service.from("routing_job_runs").insert({
        idempotency_key: ingestKey,
        category_id: upserted.category_id,
        trigger_source: "lead_insert",
        status: "running",
      });

      if (runJob.error) continue;

      const routed = await service.rpc("run_due_customer_lead_flows", {
        p_category_id: upserted.category_id,
      });
      if (routed.error) {
        await service
          .from("routing_job_runs")
          .update({
            status: "failed",
            error_text: routed.error.message,
            processed_at: new Date().toISOString(),
          })
          .eq("idempotency_key", ingestKey);
        continue;
      }

      const delivered = typeof routed.data === "number" ? routed.data : Number(routed.data ?? 0);
      await service
        .from("routing_job_runs")
        .update({
          status: "completed",
          delivered_count: delivered,
          error_text: null,
          processed_at: new Date().toISOString(),
        })
        .eq("idempotency_key", ingestKey);
    }

    skip += pageRows.length;
    if (pageRows.length < batchSize) break;
  }

  const now = new Date().toISOString();
  const { error: cursorError } = await service.from("external_sync_cursors").upsert(
    {
      provider: PROVIDER,
      last_synced_at: latestSourceUpdatedAt ?? now,
      last_success_at: now,
      last_error: null,
    },
    { onConflict: "provider" }
  );
  if (cursorError) {
    throw new Error(`Failed to persist sync cursor: ${cursorError.message}`);
  }

  return {
    fetched,
    inserted,
    updated,
    skipped_invalid: skippedInvalid,
    skip_reasons: Object.fromEntries(skipReasons),
    next_skip: skip,
    cursor_updated_at: latestSourceUpdatedAt,
  };
}
