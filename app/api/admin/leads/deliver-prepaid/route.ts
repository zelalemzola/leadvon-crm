import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { requireStaffUser, writeAuditLog } from "@/lib/server/admin/auth";

const bodySchema = z.object({
  organization_id: z.string().uuid(),
  source_lead_id: z.string().uuid(),
});

export async function POST(request: Request) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc("deliver_lead_from_prepaid_budget", {
    p_organization_id: parsed.data.organization_id,
    p_source_lead_id: parsed.data.source_lead_id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (
    !row ||
    typeof row !== "object" ||
    !("customer_lead_id" in row) ||
    typeof (row as { customer_lead_id?: unknown }).customer_lead_id !== "string"
  ) {
    return NextResponse.json({ error: "Unexpected RPC result" }, { status: 500 });
  }

  const r = row as {
    customer_lead_id: string;
    entitlement_id: string;
    amount_cents: number;
    balance_after_cents: number;
  };

  await writeAuditLog({
    actorId: staff.userId,
    action: "lead.deliver_prepaid",
    entityType: "customer_lead",
    entityId: r.customer_lead_id,
    details: {
      organization_id: parsed.data.organization_id,
      source_lead_id: parsed.data.source_lead_id,
      entitlement_id: r.entitlement_id,
      amount_cents: r.amount_cents,
    },
  });

  return NextResponse.json({ data: r });
}
