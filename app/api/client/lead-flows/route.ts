import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireCustomerUser, writeCustomerAuditLog } from "@/lib/server/client/auth";
import { customerLeadFlowSchema } from "@/lib/validation/client";

export async function GET() {
  const auth = await requireCustomerUser();
  if ("error" in auth) {
    return auth.error;
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("customer_lead_flows")
    .select(
      "*, lead_packages(id, name, leads_count, category_id), customer_flow_commitments(monthly_target_leads, business_days_only, shortfall_policy, is_active)"
    )
    .eq("organization_id", auth.organizationId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireCustomerUser({ adminOnly: true });
  if ("error" in auth) {
    return auth.error;
  }

  const body = await request.json().catch(() => null);
  const parsed = customerLeadFlowSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("customer_lead_flows")
    .upsert(
      {
        organization_id: auth.organizationId,
        package_id: parsed.data.package_id,
        leads_per_week: parsed.data.leads_per_week,
        is_active: parsed.data.is_active,
        created_by: auth.userId,
        next_run_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: "organization_id,package_id" }
    )
    .select("id, package_id, leads_per_week, is_active")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (parsed.data.monthly_target_leads !== undefined) {
    const cRes = await service.from("customer_flow_commitments").upsert(
      {
        flow_id: data.id,
        monthly_target_leads: parsed.data.monthly_target_leads,
        business_days_only: parsed.data.business_days_only ?? true,
        is_active: true,
      },
      { onConflict: "flow_id" }
    );
    if (cRes.error) {
      return NextResponse.json({ error: cRes.error.message }, { status: 400 });
    }
  }

  const shaped = await service
    .from("customer_lead_flows")
    .select(
      "id, package_id, leads_per_week, is_active, pending_delivery_leads, accrued_this_month, delivered_this_month, last_obligation_date, customer_flow_commitments(monthly_target_leads, business_days_only, shortfall_policy, is_active)"
    )
    .eq("id", data.id)
    .single();
  if (shaped.error) return NextResponse.json({ error: shaped.error.message }, { status: 400 });

  await writeCustomerAuditLog({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    action: "lead_flow_upserted",
    entityType: "customer_lead_flow",
    entityId: data.id,
    details: {
      package_id: parsed.data.package_id,
      leads_per_week: parsed.data.leads_per_week,
      monthly_target_leads: parsed.data.monthly_target_leads,
      business_days_only: parsed.data.business_days_only ?? true,
      is_active: parsed.data.is_active,
    },
  });

  return NextResponse.json({ data: shaped.data });
}
