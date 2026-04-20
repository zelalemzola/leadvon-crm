import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Call often (e.g. every 5–15 minutes) so queued leads deliver soon after inventory lands. */

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc("run_due_customer_lead_flows");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const leadsDelivered = typeof data === "number" ? data : Number(data ?? 0);
  return NextResponse.json({ data: { leads_delivered: leadsDelivered, processed: leadsDelivered } });
}
