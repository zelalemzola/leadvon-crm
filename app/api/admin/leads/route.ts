import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireStaffUser, writeAuditLog } from "@/lib/server/admin/auth";
import { leadSchema } from "@/lib/validation/admin";
import { processLeadIngestRouting } from "@/lib/server/routing/process-lead-ingest";

function normalizeLeadPayload(
  data: Partial<{ summary?: string; notes?: string }> & Record<string, unknown>
) {
  const summary =
    typeof data.summary === "string"
      ? data.summary
      : typeof data.notes === "string"
        ? data.notes
        : "";
  return { ...data, summary, notes: undefined };
}

export async function POST(request: Request) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;

  const body = await request.json().catch(() => null);
  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("leads")
    .insert(normalizeLeadPayload(parsed.data as Record<string, unknown>))
    .select("*, categories(id, name, slug)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await processLeadIngestRouting(data.category_id, `lead-insert:${data.id}`);

  await writeAuditLog({
    actorId: staff.userId,
    action: "lead.create",
    entityType: "lead",
    entityId: data.id,
    details: { category_id: data.category_id },
  });

  return NextResponse.json({ data });
}

export async function PATCH(request: Request) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const parsed = leadSchema.partial().safeParse(body);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const service = createServiceClient();
  const patch = normalizeLeadPayload(parsed.data as Record<string, unknown>);
  const { data, error } = await service
    .from("leads")
    .update(patch)
    .eq("id", id)
    .select("*, categories(id, name, slug)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAuditLog({
    actorId: staff.userId,
    action: "lead.update",
    entityType: "lead",
    entityId: id,
    details: patch as Record<string, unknown>,
  });

  return NextResponse.json({ data });
}

export async function DELETE(request: Request) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const service = createServiceClient();
  const existing = await service
    .from("leads")
    .select("id, source_system, source_external_id")
    .eq("id", id)
    .maybeSingle();
  if (existing.error) {
    return NextResponse.json({ error: existing.error.message }, { status: 400 });
  }
  if (!existing.data) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const sourceSystem = String(existing.data.source_system ?? "").trim();
  const sourceExternalId = String(existing.data.source_external_id ?? "").trim();
  if (sourceSystem && sourceExternalId) {
    const exclusion = await service.from("external_sync_exclusions").upsert(
      {
        provider: sourceSystem,
        external_id: sourceExternalId,
        reason: "deleted_by_staff",
      },
      { onConflict: "provider,external_id" }
    );
    if (exclusion.error) {
      return NextResponse.json({ error: exclusion.error.message }, { status: 400 });
    }
  }

  const { error } = await service.from("leads").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAuditLog({
    actorId: staff.userId,
    action: "lead.delete",
    entityType: "lead",
    entityId: id,
  });

  return NextResponse.json({ ok: true });
}
