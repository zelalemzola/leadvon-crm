import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { requireCustomerUser, writeCustomerAuditLog } from "@/lib/server/client/auth";

const schema = z.object({
  is_active: z.boolean().optional(),
  leads_per_week: z.number().int().min(1).max(5000).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireCustomerUser({ adminOnly: true });
  if ("error" in auth) {
    return auth.error;
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.is_active === undefined && parsed.data.leads_per_week === undefined) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("customer_lead_flows")
    .update(parsed.data)
    .eq("id", id)
    .eq("organization_id", auth.organizationId)
    .select("id, package_id, leads_per_week, is_active")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeCustomerAuditLog({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    action: "lead_flow_updated",
    entityType: "customer_lead_flow",
    entityId: id,
    details: parsed.data,
  });
  return NextResponse.json({ data });
}
