import { NextResponse } from "next/server";
import { processPendingLeadEmails } from "@/lib/server/notifications/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processPendingLeadEmails();
  return NextResponse.json({ data: result });
}
