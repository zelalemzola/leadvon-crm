import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/server/admin/auth";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;

  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get("organization_id");
  const categoryId = searchParams.get("category_id");
  const limit = Math.min(200, Math.max(20, Number(searchParams.get("limit") ?? 80)));

  const service = createServiceClient();

  let eventsQ = service
    .from("delivery_routing_events")
    .select(
      "id, process_run_id, organization_id, flow_id, source_lead_id, customer_lead_id, category_id, unit_type, routing_reason, trigger_source, deficit_before, deficit_after, rank_at_assignment, created_at, organizations(name), categories(name)"
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (organizationId) eventsQ = eventsQ.eq("organization_id", organizationId);
  if (categoryId) eventsQ = eventsQ.eq("category_id", categoryId);

  let runsQ = service
    .from("routing_job_runs")
    .select("id, idempotency_key, category_id, organization_id, trigger_source, status, delivered_count, error_text, created_at, processed_at")
    .order("created_at", { ascending: false })
    .limit(40);
  if (organizationId) runsQ = runsQ.eq("organization_id", organizationId);
  if (categoryId) runsQ = runsQ.eq("category_id", categoryId);

  let flowQ = service
    .from("customer_lead_flows")
    .select("id, organization_id, pending_delivery_leads, accrued_this_month, delivered_this_month, is_active")
    .eq("is_active", true);
  if (organizationId) flowQ = flowQ.eq("organization_id", organizationId);

  const [eventsRes, runsRes, flowRes] = await Promise.all([eventsQ, runsQ, flowQ]);

  if (eventsRes.error) return NextResponse.json({ error: eventsRes.error.message }, { status: 400 });
  if (runsRes.error) return NextResponse.json({ error: runsRes.error.message }, { status: 400 });
  if (flowRes.error) return NextResponse.json({ error: flowRes.error.message }, { status: 400 });

  const flows = flowRes.data ?? [];
  const summary = {
    active_flows: flows.length,
    queued_leads: flows.reduce((sum, f) => sum + Number(f.pending_delivery_leads ?? 0), 0),
    accrued_this_month: flows.reduce((sum, f) => sum + Number(f.accrued_this_month ?? 0), 0),
    delivered_this_month: flows.reduce((sum, f) => sum + Number(f.delivered_this_month ?? 0), 0),
  };

  return NextResponse.json({
    data: {
      summary,
      events: eventsRes.data ?? [],
      runs: runsRes.data ?? [],
    },
  });
}
