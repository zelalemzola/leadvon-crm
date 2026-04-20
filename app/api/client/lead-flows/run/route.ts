import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireCustomerUser, writeCustomerAuditLog } from "@/lib/server/client/auth";

export async function POST() {
  const auth = await requireCustomerUser({ adminOnly: true });
  if ("error" in auth) {
    return auth.error;
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc("run_due_customer_lead_flows", {
    p_organization_id: auth.organizationId,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const leadsDelivered = typeof data === "number" ? data : Number(data ?? 0);

  await writeCustomerAuditLog({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    action: "lead_flow_run_triggered",
    entityType: "customer_lead_flow",
    details: { leads_delivered: leadsDelivered },
  });

  return NextResponse.json({
    data: {
      processed: leadsDelivered,
      leads_delivered: leadsDelivered,
      failed: [] as Array<{
        flow_id: string;
        package_id: string;
        package_name: string;
        reason: string;
      }>,
    },
  });
}
