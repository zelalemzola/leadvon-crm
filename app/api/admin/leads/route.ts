import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireStaffUser, writeAuditLog } from "@/lib/server/admin/auth";
import { leadSchema } from "@/lib/validation/admin";

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

  // Ingest-triggered processing: when new inventory arrives, try immediate catch-up for this category.
  // Idempotency key guarantees duplicate triggers for the same lead insert are harmless.
  const ingestKey = `lead-insert:${data.id}`;
  const runJob = await service.from("routing_job_runs").insert({
    idempotency_key: ingestKey,
    category_id: data.category_id,
    trigger_source: "lead_insert",
    status: "running",
  });
  if (!runJob.error) {
    const routed = await service.rpc("run_due_customer_lead_flows", {
      p_category_id: data.category_id,
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
    } else {
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
  }

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
