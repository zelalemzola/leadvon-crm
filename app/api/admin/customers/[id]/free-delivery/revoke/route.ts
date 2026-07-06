import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireStaffUser, writeAuditLog } from "@/lib/server/admin/auth";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;

  const { id: organizationId } = await params;
  const service = createServiceClient();

  const { data: org, error: orgError } = await service
    .from("organizations")
    .select("id, name")
    .eq("id", organizationId)
    .maybeSingle();
  if (orgError) return NextResponse.json({ error: orgError.message }, { status: 400 });
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const { data: campaignLeads, error: leadsError } = await service
    .from("customer_leads")
    .select("id, source_lead_id")
    .eq("organization_id", organizationId)
    .eq("grant_source", "free_delivery");
  if (leadsError) return NextResponse.json({ error: leadsError.message }, { status: 400 });

  const rows = campaignLeads ?? [];
  const sourceLeadIds = [...new Set(rows.map((r) => r.source_lead_id).filter(Boolean))];
  const customerLeadIds = rows.map((r) => r.id);

  if (sourceLeadIds.length > 0) {
    const { error: unsellError } = await service
      .from("leads")
      .update({ sold_at: null })
      .in("id", sourceLeadIds);
    if (unsellError) return NextResponse.json({ error: unsellError.message }, { status: 400 });
  }

  if (customerLeadIds.length > 0) {
    const { error: notifError } = await service
      .from("customer_notifications")
      .delete()
      .eq("entity_type", "customer_lead")
      .in("entity_id", customerLeadIds);
    if (notifError) return NextResponse.json({ error: notifError.message }, { status: 400 });

    const { error: deleteError } = await service
      .from("customer_leads")
      .delete()
      .in("id", customerLeadIds);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  const { data: deliveryRow, error: deliveryReadError } = await service
    .from("organization_free_delivery")
    .select("quota_delivered")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (deliveryReadError) {
    return NextResponse.json({ error: deliveryReadError.message }, { status: 400 });
  }

  if (deliveryRow) {
    const removed = rows.length;
    const nextDelivered = Math.max(0, Number(deliveryRow.quota_delivered ?? 0) - removed);
    const { error: deliveryUpdateError } = await service
      .from("organization_free_delivery")
      .update({
        quota_delivered: nextDelivered,
        is_active: false,
      })
      .eq("organization_id", organizationId);
    if (deliveryUpdateError) {
      return NextResponse.json({ error: deliveryUpdateError.message }, { status: 400 });
    }
  }

  await writeAuditLog({
    actorId: staff.userId,
    action: "customer.free_delivery_revoke",
    entityType: "organization",
    entityId: organizationId,
    details: {
      organization_name: org.name,
      revoked_customer_leads: rows.length,
      returned_source_leads: sourceLeadIds.length,
    },
  });

  return NextResponse.json({
    data: {
      organization_id: organizationId,
      revoked_customer_leads: rows.length,
      returned_source_leads: sourceLeadIds.length,
      free_delivery_disabled: true,
    },
  });
}
