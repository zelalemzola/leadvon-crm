import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireCustomerUser, writeCustomerAuditLog } from "@/lib/server/client/auth";
import { clientLeadPatchSchema } from "@/lib/validation/client";
import { createLeadStatusNotifications } from "@/lib/server/notifications/dispatch";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireCustomerUser();
  if ("error" in auth) {
    return auth.error;
  }

  const body = await request.json().catch(() => null);
  const parsed = clientLeadPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (
    parsed.data.status === undefined &&
    parsed.data.notes === undefined &&
    parsed.data.assigned_to === undefined &&
    parsed.data.call_count === undefined
  ) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: existingLead } = await service
    .from("customer_leads")
    .select("id, status, first_name, last_name, assigned_to, organization_id")
    .eq("id", id)
    .eq("organization_id", auth.organizationId)
    .maybeSingle();

  if (parsed.data.assigned_to) {
    const { data: assignee } = await service
      .from("profiles")
      .select("id, organization_id, is_active")
      .eq("id", parsed.data.assigned_to)
      .maybeSingle();
    if (!assignee || assignee.organization_id !== auth.organizationId || !assignee.is_active) {
      return NextResponse.json({ error: "Invalid assignee" }, { status: 400 });
    }
  }

  const updatePayload: {
    status?: string;
    notes?: string;
    assigned_to?: string | null;
    call_count?: number;
    status_updated_at?: string;
  } = {};
  if (parsed.data.status !== undefined) {
    updatePayload.status = parsed.data.status;
    updatePayload.status_updated_at = new Date().toISOString();
  }
  if (parsed.data.notes !== undefined) updatePayload.notes = parsed.data.notes;
  if (parsed.data.assigned_to !== undefined) updatePayload.assigned_to = parsed.data.assigned_to;
  if (parsed.data.call_count !== undefined) updatePayload.call_count = parsed.data.call_count;

  const { data, error } = await service
    .from("customer_leads")
    .update(updatePayload)
    .eq("id", id)
    .eq("organization_id", auth.organizationId)
    .select(
      "*, categories(id, name, slug), assignee:profiles!customer_leads_assigned_to_fkey(id, email, full_name)"
    )
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeCustomerAuditLog({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    action: "customer_lead_updated",
    entityType: "customer_lead",
    entityId: id,
    details: {
      status: parsed.data.status,
      assigned_to: parsed.data.assigned_to,
      notes_updated: parsed.data.notes !== undefined,
      call_count: parsed.data.call_count,
    },
  });

  if (
    existingLead &&
    parsed.data.status !== undefined &&
    parsed.data.status !== existingLead.status
  ) {
    const leadName = `${existingLead.first_name ?? ""} ${existingLead.last_name ?? ""}`.trim() || "Lead";
    await createLeadStatusNotifications({
      organizationId: auth.organizationId,
      leadId: id,
      actorId: auth.userId,
      leadName,
      oldStatus: existingLead.status,
      newStatus: parsed.data.status,
      assignedTo: existingLead.assigned_to,
    });
  }

  return NextResponse.json({ data });
}
