import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireCustomerUser, writeCustomerAuditLog } from "@/lib/server/client/auth";
import { clientLeadPatchSchema } from "@/lib/validation/client";

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
    parsed.data.assigned_to === undefined
  ) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const service = createServiceClient();
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
    status_updated_at?: string;
  } = {};
  if (parsed.data.status !== undefined) {
    updatePayload.status = parsed.data.status;
    updatePayload.status_updated_at = new Date().toISOString();
  }
  if (parsed.data.notes !== undefined) updatePayload.notes = parsed.data.notes;
  if (parsed.data.assigned_to !== undefined) updatePayload.assigned_to = parsed.data.assigned_to;

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
    },
  });

  return NextResponse.json({ data });
}
