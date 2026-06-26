import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { processPendingLeadEmails } from "@/lib/server/notifications/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Call often (e.g. every 5–15 minutes) so queued leads deliver soon after inventory lands. */

function isAuthorized(request: Request) {
  const auth = request.headers.get("authorization");
  const xCron = request.headers.get("x-cron-secret");
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return auth === `Bearer ${secret}` || xCron === secret;
}

async function run(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const paidFirst = await service.rpc("run_due_customer_lead_flows");
  if (paidFirst.error) {
    return NextResponse.json({ error: paidFirst.error.message }, { status: 400 });
  }
  const freeDelivery = await service.rpc("distribute_free_delivery_leads");
  if (freeDelivery.error) {
    return NextResponse.json({ error: freeDelivery.error.message }, { status: 400 });
  }
  const paidCount = typeof paidFirst.data === "number" ? paidFirst.data : Number(paidFirst.data ?? 0);
  const freeCount =
    typeof freeDelivery.data === "number" ? freeDelivery.data : Number(freeDelivery.data ?? 0);
  const leadsDelivered = paidCount + freeCount;
  if (leadsDelivered > 0) {
    await processPendingLeadEmails();
  }
  return NextResponse.json({
    data: {
      leads_delivered: leadsDelivered,
      paid_leads_delivered: paidCount,
      free_delivery_leads_delivered: freeCount,
      processed: leadsDelivered,
    },
  });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
