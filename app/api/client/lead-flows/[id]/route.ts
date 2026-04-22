import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { requireCustomerUser, writeCustomerAuditLog } from "@/lib/server/client/auth";

const schema = z.object({
  is_active: z.boolean().optional(),
  leads_per_week: z.number().int().min(1).max(5000).optional(),
  monthly_target_leads: z.number().int().min(1).max(50000).optional(),
  business_days_only: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireCustomerUser({ adminOnly: true });
  if ("error" in auth) {
    return auth.error;
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (
    parsed.data.is_active === undefined &&
    parsed.data.leads_per_week === undefined &&
    parsed.data.monthly_target_leads === undefined &&
    parsed.data.business_days_only === undefined
  ) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const service = createServiceClient();
  const flowPatch: { is_active?: boolean; leads_per_week?: number } = {};
  if (parsed.data.is_active !== undefined) flowPatch.is_active = parsed.data.is_active;
  if (parsed.data.leads_per_week !== undefined) flowPatch.leads_per_week = parsed.data.leads_per_week;

  let data:
    | {
        id: string;
        package_id: string;
        leads_per_week: number;
        is_active: boolean;
        pending_delivery_leads: number | null;
        accrued_this_month: number | null;
        delivered_this_month: number | null;
        last_obligation_date: string | null;
      }
    | null = null;
  if (Object.keys(flowPatch).length > 0) {
    const flowRes = await service
      .from("customer_lead_flows")
      .update(flowPatch)
      .eq("id", id)
      .eq("organization_id", auth.organizationId)
      .select(
        "id, package_id, leads_per_week, is_active, pending_delivery_leads, accrued_this_month, delivered_this_month, last_obligation_date"
      )
      .single();
    if (flowRes.error) return NextResponse.json({ error: flowRes.error.message }, { status: 400 });
    data = flowRes.data;
  } else {
    const flowRes = await service
      .from("customer_lead_flows")
      .select(
        "id, package_id, leads_per_week, is_active, pending_delivery_leads, accrued_this_month, delivered_this_month, last_obligation_date"
      )
      .eq("id", id)
      .eq("organization_id", auth.organizationId)
      .single();
    if (flowRes.error) return NextResponse.json({ error: flowRes.error.message }, { status: 400 });
    data = flowRes.data;
  }

  if (parsed.data.monthly_target_leads !== undefined || parsed.data.business_days_only !== undefined) {
    const existing = await service
      .from("customer_flow_commitments")
      .select("monthly_target_leads, business_days_only")
      .eq("flow_id", id)
      .maybeSingle();
    if (existing.error) {
      return NextResponse.json({ error: existing.error.message }, { status: 400 });
    }
    const commitmentPatch = {
      flow_id: id,
      monthly_target_leads:
        parsed.data.monthly_target_leads ??
        existing.data?.monthly_target_leads ??
        Math.max(1, Math.ceil(data.leads_per_week * 4.33)),
      business_days_only: parsed.data.business_days_only ?? existing.data?.business_days_only ?? true,
      is_active: true,
    };
    const cRes = await service
      .from("customer_flow_commitments")
      .upsert(commitmentPatch, { onConflict: "flow_id" });
    if (cRes.error) {
      return NextResponse.json({ error: cRes.error.message }, { status: 400 });
    }
  }

  const shaped = await service
    .from("customer_lead_flows")
    .select(
      "id, package_id, leads_per_week, is_active, pending_delivery_leads, accrued_this_month, delivered_this_month, last_obligation_date, customer_flow_commitments(monthly_target_leads, business_days_only, shortfall_policy, is_active)"
    )
    .eq("id", id)
    .single();
  if (shaped.error) return NextResponse.json({ error: shaped.error.message }, { status: 400 });

  await writeCustomerAuditLog({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    action: "lead_flow_updated",
    entityType: "customer_lead_flow",
    entityId: id,
    details: parsed.data,
  });
  return NextResponse.json({ data: shaped.data });
}
