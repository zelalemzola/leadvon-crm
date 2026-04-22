import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/server/admin/auth";
import { createServiceClient } from "@/lib/supabase/service";

type Org = { id: string; name: string; phone: string | null; created_at: string };
type Profile = {
  id: string;
  organization_id: string | null;
  role: "customer_admin" | "customer_agent" | "staff";
  is_active: boolean;
  email: string | null;
  full_name: string | null;
};
type Flow = {
  id: string;
  organization_id: string;
  is_active: boolean;
  pending_delivery_leads: number | null;
  accrued_this_month: number | null;
  delivered_this_month: number | null;
};
type Commitment = { flow_id: string; monthly_target_leads: number | null; is_active: boolean };
type Entitlement = {
  organization_id: string;
  status: "active" | "depleted" | "expired";
  budget_cents_remaining: number;
};
type Invoice = { organization_id: string; status: "open" | "paid" | "void"; total_cents: number };
type Ledger = { organization_id: string; amount_cents: number; created_at: string };

export async function GET(request: Request) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("organization_id");

  const service = createServiceClient();

  const orgQ = service
    .from("organizations")
    .select("id, name, phone, created_at")
    .order("created_at", { ascending: false });
  const { data: orgs, error: orgErr } = orgId ? await orgQ.eq("id", orgId) : await orgQ;
  if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 400 });

  const orgIds = (orgs ?? []).map((o) => o.id);
  if (orgIds.length === 0) return NextResponse.json({ data: [] });

  const [
    profilesRes,
    flowsRes,
    commitmentsRes,
    entitlementsRes,
    invoicesRes,
    ledgerRes,
  ] = await Promise.all([
    service
      .from("profiles")
      .select("id, organization_id, role, is_active, email, full_name")
      .in("organization_id", orgIds)
      .in("role", ["customer_admin", "customer_agent"]),
    service
      .from("customer_lead_flows")
      .select("id, organization_id, is_active, pending_delivery_leads, accrued_this_month, delivered_this_month")
      .in("organization_id", orgIds),
    service
      .from("customer_flow_commitments")
      .select("flow_id, monthly_target_leads, is_active"),
    service
      .from("delivery_entitlements")
      .select("organization_id, status, budget_cents_remaining")
      .in("organization_id", orgIds),
    service
      .from("delivery_invoices")
      .select("organization_id, status, total_cents")
      .in("organization_id", orgIds),
    service
      .from("delivery_ledger_lines")
      .select("organization_id, amount_cents, created_at")
      .in("organization_id", orgIds),
  ]);

  if (profilesRes.error) {
    return NextResponse.json({ error: profilesRes.error.message }, { status: 400 });
  }
  if (flowsRes.error) return NextResponse.json({ error: flowsRes.error.message }, { status: 400 });
  if (commitmentsRes.error) {
    return NextResponse.json({ error: commitmentsRes.error.message }, { status: 400 });
  }
  if (entitlementsRes.error) {
    return NextResponse.json({ error: entitlementsRes.error.message }, { status: 400 });
  }
  if (invoicesRes.error) {
    return NextResponse.json({ error: invoicesRes.error.message }, { status: 400 });
  }
  if (ledgerRes.error) return NextResponse.json({ error: ledgerRes.error.message }, { status: 400 });

  const profiles = (profilesRes.data ?? []) as Profile[];
  const flows = (flowsRes.data ?? []) as Flow[];
  const commitments = (commitmentsRes.data ?? []) as Commitment[];
  const entitlements = (entitlementsRes.data ?? []) as Entitlement[];
  const invoices = (invoicesRes.data ?? []) as Invoice[];
  const ledger = (ledgerRes.data ?? []) as Ledger[];

  const commitmentByFlow = new Map<string, number>();
  for (const c of commitments) {
    if (c.is_active && c.monthly_target_leads) commitmentByFlow.set(c.flow_id, c.monthly_target_leads);
  }

  const data = ((orgs ?? []) as Org[]).map((org) => {
    const p = profiles.filter((x) => x.organization_id === org.id);
    const admins = p.filter((x) => x.role === "customer_admin");
    const agents = p.filter((x) => x.role === "customer_agent");
    const activeMembers = p.filter((x) => x.is_active).length;
    const primaryAdmin = admins[0] ?? null;

    const f = flows.filter((x) => x.organization_id === org.id && x.is_active);
    const queue = f.reduce((sum, x) => sum + Number(x.pending_delivery_leads ?? 0), 0);
    const accrued = f.reduce((sum, x) => sum + Number(x.accrued_this_month ?? 0), 0);
    const delivered = f.reduce((sum, x) => sum + Number(x.delivered_this_month ?? 0), 0);
    const target = f.reduce((sum, x) => sum + Number(commitmentByFlow.get(x.id) ?? 0), 0);

    const e = entitlements.filter((x) => x.organization_id === org.id && x.status === "active");
    const activeBudgetCents = e.reduce((sum, x) => sum + Number(x.budget_cents_remaining ?? 0), 0);

    const inv = invoices.filter((x) => x.organization_id === org.id);
    const openInvoices = inv.filter((x) => x.status === "open");
    const openInvoiceCents = openInvoices.reduce((sum, x) => sum + Number(x.total_cents ?? 0), 0);

    const l = ledger.filter((x) => x.organization_id === org.id);
    const totalSpendCents = l.reduce((sum, x) => sum + Number(x.amount_cents ?? 0), 0);
    const lastDeliveryAt = l
      .map((x) => x.created_at)
      .sort((a, b) => +new Date(b) - +new Date(a))[0] ?? null;

    const pacePct = accrued > 0 ? Math.round((delivered / accrued) * 100) : 0;

    return {
      organization_id: org.id,
      organization_name: org.name,
      phone: org.phone,
      created_at: org.created_at,
      primary_admin_name: primaryAdmin?.full_name ?? null,
      primary_admin_email: primaryAdmin?.email ?? null,
      members_count: p.length,
      admins_count: admins.length,
      agents_count: agents.length,
      active_members_count: activeMembers,
      active_flows_count: f.length,
      pending_queue_leads: queue,
      accrued_this_month: accrued,
      delivered_this_month: delivered,
      monthly_target_leads: target,
      pace_pct: Math.min(100, Math.max(0, pacePct)),
      active_budget_cents: activeBudgetCents,
      open_invoices_count: openInvoices.length,
      open_invoices_cents: openInvoiceCents,
      total_spend_cents: totalSpendCents,
      last_delivery_at: lastDeliveryAt,
    };
  });

  return NextResponse.json({ data });
}
