import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCustomerUser, writeCustomerAuditLog } from "@/lib/server/client/auth";

const schema = z.object({
  package_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(100),
});

export async function POST(request: Request) {
  const auth = await requireCustomerUser({ adminOnly: true });
  if ("error" in auth) {
    return auth.error;
  }
  const supabase = await createClient();

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("customer_purchase_package", {
    p_package_id: parsed.data.package_id,
    p_quantity: parsed.data.quantity,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const first = (data ?? [])[0] as
    | { purchase_id: string; total_amount_cents: number; leads_allocated: number }
    | undefined;
  if (!first) return NextResponse.json({ error: "Purchase failed" }, { status: 400 });
  await writeCustomerAuditLog({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    action: "lead_package_purchased",
    entityType: "lead_purchase",
    entityId: first.purchase_id,
    details: {
      package_id: parsed.data.package_id,
      quantity: parsed.data.quantity,
      total_amount_cents: first.total_amount_cents,
      leads_allocated: first.leads_allocated,
    },
  });
  return NextResponse.json({ data: first });
}
