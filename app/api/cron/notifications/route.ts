import { NextResponse } from "next/server";
import {
  processPendingLeadEmails,
  processPendingPushNotifications,
} from "@/lib/server/notifications/dispatch";
import { processPendingGoogleSheetLeadExports } from "@/lib/server/integrations/google-sheet-lead-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Email flush already runs sheet export at the end; call sheets again only as a
  // safety net after email so a partial email failure path still drains the queue.
  const [email, push] = await Promise.all([
    processPendingLeadEmails(),
    processPendingPushNotifications(),
  ]);
  const sheets = await processPendingGoogleSheetLeadExports();
  return NextResponse.json({ data: { email, push, sheets } });
}
