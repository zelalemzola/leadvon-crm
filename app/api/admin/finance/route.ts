import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/server/admin/auth";
import { createServiceClient } from "@/lib/supabase/service";

type Invoice = {
  invoice_type: "prepaid_purchase" | "month_end_usage";
  status: "open" | "paid" | "void";
  total_cents: number;
  created_at: string;
};
type Entitlement = { status: "active" | "depleted" | "expired"; budget_cents_remaining: number };
type Ledger = { amount_cents: number; created_at: string };

export async function GET(request: Request) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;

  const { searchParams } = new URL(request.url);
  const months = Math.min(24, Math.max(3, Number(searchParams.get("months") ?? 6)));

  const service = createServiceClient();
  const sinceDate = new Date();
  sinceDate.setUTCMonth(sinceDate.getUTCMonth() - (months - 1));
  sinceDate.setUTCDate(1);
  sinceDate.setUTCHours(0, 0, 0, 0);
  const sinceIso = sinceDate.toISOString();

  const [invRes, entRes, ledRes] = await Promise.all([
    service
      .from("delivery_invoices")
      .select("invoice_type, status, total_cents, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false }),
    service
      .from("delivery_entitlements")
      .select("status, budget_cents_remaining"),
    service
      .from("delivery_ledger_lines")
      .select("amount_cents, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false }),
  ]);

  if (invRes.error) return NextResponse.json({ error: invRes.error.message }, { status: 400 });
  if (entRes.error) return NextResponse.json({ error: entRes.error.message }, { status: 400 });
  if (ledRes.error) return NextResponse.json({ error: ledRes.error.message }, { status: 400 });

  const invoices = (invRes.data ?? []) as Invoice[];
  const entitlements = (entRes.data ?? []) as Entitlement[];
  const ledger = (ledRes.data ?? []) as Ledger[];

  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const cashCollected30d = invoices
    .filter((i) => i.status === "paid" && i.created_at >= last30)
    .reduce((sum, i) => sum + Number(i.total_cents ?? 0), 0);

  const openArCents = invoices
    .filter((i) => i.status === "open")
    .reduce((sum, i) => sum + Number(i.total_cents ?? 0), 0);

  const recognizedRevenue30d = ledger
    .filter((l) => l.created_at >= last30)
    .reduce((sum, l) => sum + Number(l.amount_cents ?? 0), 0);

  const mrrCurrentMonth = invoices
    .filter((i) => i.status === "paid" && i.created_at >= startOfMonth)
    .reduce((sum, i) => sum + Number(i.total_cents ?? 0), 0);

  const prepaidLiabilityCents = entitlements
    .filter((e) => e.status === "active")
    .reduce((sum, e) => sum + Number(e.budget_cents_remaining ?? 0), 0);

  const monthKeys: string[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    monthKeys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  const invoiceByMonth = new Map<string, number>();
  const ledgerByMonth = new Map<string, number>();
  for (const i of invoices) {
    if (i.status !== "paid") continue;
    const d = new Date(i.created_at);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    invoiceByMonth.set(key, (invoiceByMonth.get(key) ?? 0) + Number(i.total_cents ?? 0));
  }
  for (const l of ledger) {
    const d = new Date(l.created_at);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    ledgerByMonth.set(key, (ledgerByMonth.get(key) ?? 0) + Number(l.amount_cents ?? 0));
  }

  const monthly = monthKeys.map((key) => ({
    month: key,
    cash_collected_cents: invoiceByMonth.get(key) ?? 0,
    recognized_delivery_cents: ledgerByMonth.get(key) ?? 0,
  }));

  return NextResponse.json({
    data: {
      months,
      kpis: {
        mrr_current_month_cents: mrrCurrentMonth,
        cash_collected_30d_cents: cashCollected30d,
        open_ar_cents: openArCents,
        prepaid_liability_cents: prepaidLiabilityCents,
        recognized_delivery_30d_cents: recognizedRevenue30d,
      },
      monthly,
    },
  });
}
