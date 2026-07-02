import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireStaffUser } from "@/lib/server/admin/auth";

export async function GET() {
  const auth = await requireStaffUser();
  if ("error" in auth) return auth.error;

  const service = createServiceClient();
  const [balancesRes, messagesRes] = await Promise.all([
    service
      .from("sms_balances")
      .select("*, organizations(id, name)")
      .order("balance_cents", { ascending: false }),
    service
      .from("sms_messages")
      .select("*, organizations(id, name), customer_leads(first_name, last_name)")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (balancesRes.error) {
    return NextResponse.json({ error: balancesRes.error.message }, { status: 400 });
  }
  if (messagesRes.error) {
    return NextResponse.json({ error: messagesRes.error.message }, { status: 400 });
  }

  const totals = {
    organizations: balancesRes.data?.length ?? 0,
    total_balance_cents:
      balancesRes.data?.reduce((sum, row) => sum + Number(row.balance_cents || 0), 0) ?? 0,
    messages_sent: messagesRes.data?.length ?? 0,
    total_sms_spend_cents:
      messagesRes.data?.reduce((sum, row) => sum + Number(row.cost_cents || 0), 0) ?? 0,
  };

  return NextResponse.json({
    data: {
      totals,
      balances: balancesRes.data ?? [],
      recent_messages: messagesRes.data ?? [],
    },
  });
}
