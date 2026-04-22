import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/server/admin/auth";
import { createServiceClient } from "@/lib/supabase/service";

type LedgerRow = {
  id: string;
  organization_id: string;
  category_id: string;
  unit_type: "single" | "family";
  amount_cents: number;
  customer_lead_id: string | null;
  created_at: string;
};

type PricebookRow = {
  category_id: string;
  unit_type: "single" | "family";
  price_cents: number;
  categories?: { name?: string } | null;
};

type OrgRow = { id: string; name: string };

export async function GET(request: Request) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;

  const { searchParams } = new URL(request.url);
  const days = Math.min(365, Math.max(1, Number(searchParams.get("days") ?? 30)));
  const organizationId = searchParams.get("organization_id");
  const categoryId = searchParams.get("category_id");

  const cutoffIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const service = createServiceClient();

  let ledgerQ = service
    .from("delivery_ledger_lines")
    .select("id, organization_id, category_id, unit_type, amount_cents, customer_lead_id, created_at")
    .gte("created_at", cutoffIso)
    .order("created_at", { ascending: false })
    .limit(20000);
  if (organizationId) ledgerQ = ledgerQ.eq("organization_id", organizationId);
  if (categoryId) ledgerQ = ledgerQ.eq("category_id", categoryId);

  const [ledgerRes, pricebookRes, orgsRes] = await Promise.all([
    ledgerQ,
    service
      .from("lead_pricebook")
      .select("category_id, unit_type, price_cents, categories(name)")
      .eq("active", true),
    service.from("organizations").select("id, name"),
  ]);

  if (ledgerRes.error) return NextResponse.json({ error: ledgerRes.error.message }, { status: 400 });
  if (pricebookRes.error) return NextResponse.json({ error: pricebookRes.error.message }, { status: 400 });
  if (orgsRes.error) return NextResponse.json({ error: orgsRes.error.message }, { status: 400 });

  const ledger = (ledgerRes.data ?? []) as LedgerRow[];
  const pricebook = (pricebookRes.data ?? []) as PricebookRow[];
  const orgs = (orgsRes.data ?? []) as OrgRow[];

  const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));
  const baselineByCategoryUnit = new Map<string, { price_cents: number; category_name: string }>();
  for (const p of pricebook) {
    baselineByCategoryUnit.set(`${p.category_id}|${p.unit_type}`, {
      price_cents: Number(p.price_cents ?? 0),
      category_name: p.categories?.name ?? "Category",
    });
  }

  // Bucket -> (lead_id -> summed charge), to avoid double-counting split ledger lines.
  const leadTotalsByBucket = new Map<string, Map<string, number>>();
  for (const row of ledger) {
    const bucket = `${row.organization_id}|${row.category_id}|${row.unit_type}`;
    const leadKey = row.customer_lead_id ?? `line:${row.id}`;
    const leadMap = leadTotalsByBucket.get(bucket) ?? new Map<string, number>();
    leadMap.set(leadKey, (leadMap.get(leadKey) ?? 0) + Number(row.amount_cents ?? 0));
    leadTotalsByBucket.set(bucket, leadMap);
  }

  const rows = [...leadTotalsByBucket.entries()]
    .map(([bucket, leadMap]) => {
      const [orgId, catId, unitType] = bucket.split("|");
      const baseline = baselineByCategoryUnit.get(`${catId}|${unitType}`);
      const totalCents = [...leadMap.values()].reduce((sum, x) => sum + x, 0);
      const leadsCount = leadMap.size;
      const effectiveCplCents = leadsCount > 0 ? Math.round(totalCents / leadsCount) : 0;
      const baselineCplCents = baseline?.price_cents ?? 0;
      const deltaCents = effectiveCplCents - baselineCplCents;
      const deltaPct =
        baselineCplCents > 0 ? Math.round((deltaCents / baselineCplCents) * 100) : 0;
      const absPct = Math.abs(deltaPct);
      const severity = absPct >= 20 ? "critical" : absPct >= 10 ? "warn" : "ok";
      return {
        organization_id: orgId,
        organization_name: orgNameById.get(orgId) ?? orgId.slice(0, 8),
        category_id: catId,
        category_name: baseline?.category_name ?? "Category",
        unit_type: unitType as "single" | "family",
        leads_count: leadsCount,
        total_cents: totalCents,
        effective_cpl_cents: effectiveCplCents,
        baseline_cpl_cents: baselineCplCents,
        delta_cents: deltaCents,
        delta_pct: deltaPct,
        severity,
      };
    })
    .sort((a, b) => {
      const sevRank = (s: string) => (s === "critical" ? 2 : s === "warn" ? 1 : 0);
      const sr = sevRank(b.severity) - sevRank(a.severity);
      if (sr !== 0) return sr;
      return Math.abs(b.delta_cents) - Math.abs(a.delta_cents);
    });

  return NextResponse.json({ data: { days, rows } });
}
