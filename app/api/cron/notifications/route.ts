import { NextResponse } from "next/server";
import {
  processPendingLeadEmails,
  processPendingPushNotifications,
} from "@/lib/server/notifications/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [email, push] = await Promise.all([
    processPendingLeadEmails(),
    processPendingPushNotifications(),
  ]);
  return NextResponse.json({ data: { email, push } });
}
