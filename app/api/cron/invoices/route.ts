import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Month-end invoice generation for uninvoiced delivery ledger usage.
 * Schedule monthly (e.g. 00:15 UTC on the 1st), or call manually with month_start.
 */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({} as { month_start?: string }));
  const service = createServiceClient();
  const { data, error } = await service.rpc("generate_month_end_delivery_invoices", {
    p_month_start: body.month_start ?? null,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data: { invoices_created: Number(data ?? 0) } });
}
