import { createServiceClient } from "@/lib/supabase/service";
import { listFunnelFormSubmissions } from "@/lib/integrations/funnel";
import { mapFunnelSubmissionToInventoryLead } from "@/lib/integrations/funnel-mapper";
import { processLeadIngestRouting } from "@/lib/server/routing/process-lead-ingest";
import { processPendingLeadEmails } from "@/lib/server/notifications/dispatch";
import {
  isOnOrAfterIngestFrom,
  maxIsoTimestamp,
  resolveIngestFrom,
} from "@/lib/server/ingestion/ingest-from";

const PROVIDER = "funnel";
const DEBT_REVIEW_SLUG = "debt-review";

function getBatchSize() {
  const raw = Number(process.env.FUNNEL_INGEST_BATCH_SIZE ?? 100);
  if (!Number.isFinite(raw) || raw <= 0) return 100;
  return Math.min(Math.floor(raw), 500);
}

function getDefaultCategoryId() {
  const id = process.env.FUNNEL_DEFAULT_CATEGORY_ID?.trim();
  return id && id.length > 0 ? id : null;
}

type SyncedLeadRow = {
  id: string;
  created_at: string;
  updated_at: string;
  category_id: string;
  source_updated_at: string | null;
};

export type FunnelSyncResult = {
  fetched: number;
  inserted: number;
  updated: number;
  skipped_invalid: number;
  skip_reasons: Record<string, number>;
  next_skip: number;
  cursor_updated_at: string | null;
};

export async function runFunnelSyncOnce(): Promise<FunnelSyncResult> {
  const service = createServiceClient();
  const batchSize = getBatchSize();
  const defaultCategoryId = getDefaultCategoryId();
  const { data: categoryRows, error: categoryError } = await service
    .from("categories")
    .select("id,name,slug")
    .eq("slug", DEBT_REVIEW_SLUG)
    .limit(1);
  if (categoryError) {
    throw new Error(`Failed to load categories: ${categoryError.message}`);
  }
  const debtReviewCategory = categoryRows?.[0];
  const categoryId = debtReviewCategory ? String(debtReviewCategory.id) : defaultCategoryId;
  if (!categoryId) {
    throw new Error("Debt Review category is not configured");
  }

  const { data: cursorRow } = await service
    .from("external_sync_cursors")
    .select("provider,last_synced_at,ingest_from")
    .eq("provider", PROVIDER)
    .maybeSingle();

  const ingestFrom = resolveIngestFrom(
    (cursorRow as { ingest_from?: string | null } | null)?.ingest_from
  );
  const createdFrom = maxIsoTimestamp(cursorRow?.last_synced_at, ingestFrom);

  let inserted = 0;
  let updated = 0;
  let skippedInvalid = 0;
  const skipReasons = new Map<string, number>();
  let latestSourceUpdatedAt: string | null = createdFrom;
  let fetched = 0;
  let skip = 0;
  const maxPages = 50;

  const addSkipReason = (reason: string) => {
    skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1);
  };

  for (let page = 0; page < maxPages; page += 1) {
    const pageRows = await listFunnelFormSubmissions({
      limit: batchSize,
      offset: skip,
      createdFrom,
    });
    if (pageRows.length === 0) break;
    fetched += pageRows.length;

    for (const raw of pageRows) {
      if (!isOnOrAfterIngestFrom(raw.created_at, ingestFrom)) {
        skippedInvalid += 1;
        addSkipReason("before_ingest_from");
        continue;
      }

      const mapped = mapFunnelSubmissionToInventoryLead(raw, categoryId);
      if (!mapped.ok) {
        skippedInvalid += 1;
        addSkipReason(`validation:${mapped.reason}`);
        continue;
      }
      const payload = mapped.data;

      const excluded = await service
        .from("external_sync_exclusions")
        .select("external_id")
        .eq("provider", payload.source_system)
        .eq("external_id", payload.source_external_id)
        .maybeSingle();
      if (excluded.error) {
        skippedInvalid += 1;
        addSkipReason(`exclusion_lookup:${excluded.error.message}`);
        continue;
      }
      if (excluded.data) {
        skippedInvalid += 1;
        addSkipReason("excluded_by_staff");
        continue;
      }

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

      const ingestKey = `funnel:${String(payload.source_external_id)}`;
      await processLeadIngestRouting(upserted.category_id, ingestKey);
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

  await processPendingLeadEmails();

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
