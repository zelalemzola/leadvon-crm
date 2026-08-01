import { NextResponse } from "next/server";
import { requireStaffUser, writeAuditLog } from "@/lib/server/admin/auth";
import { runWmLeadsSyncOnce } from "@/lib/server/ingestion/wmleads-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;

  try {
    const result = await runWmLeadsSyncOnce();
    await writeAuditLog({
      actorId: staff.userId,
      action: "lead.sync_wmleads",
      entityType: "lead_sync",
      details: result as Record<string, unknown>,
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown wmleads sync error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
