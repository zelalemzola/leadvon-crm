import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireCustomerUser, writeCustomerAuditLog } from "@/lib/server/client/auth";

export async function POST() {
  const auth = await requireCustomerUser({ adminOnly: true });
  if ("error" in auth) {
    return auth.error;
  }

  const service = createServiceClient();
  const { data: flows, error: fErr } = await service
    .from("customer_lead_flows")
    .select(
      "id, organization_id, package_id, leads_per_week, created_by, is_active, next_run_at, lead_packages(name, leads_count)"
    )
    .eq("organization_id", auth.organizationId)
    .eq("is_active", true)
    .lte("next_run_at", new Date().toISOString());
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 400 });

  let processed = 0;
  const failed: Array<{
    flow_id: string;
    package_id: string;
    package_name: string;
    reason: string;
  }> = [];
  for (const flow of flows ?? []) {
    const pkg = flow.lead_packages as
      | { name?: string; leads_count?: number }
      | { name?: string; leads_count?: number }[]
      | null;
    const leadsPerPackage = Array.isArray(pkg)
      ? Number(pkg[0]?.leads_count ?? 0)
      : Number(pkg?.leads_count ?? 0);
    const packageName = Array.isArray(pkg) ? (pkg[0]?.name ?? "Package") : (pkg?.name ?? "Package");
    if (!leadsPerPackage) {
      failed.push({
        flow_id: flow.id,
        package_id: flow.package_id,
        package_name: packageName,
        reason: "Package configuration is invalid. Please ask support to review it.",
      });
      continue;
    }
    const quantity = Math.max(1, Math.ceil(flow.leads_per_week / leadsPerPackage));
    const actorId =
      flow.created_by ??
      auth.userId;
    const purchase = await service.rpc("customer_purchase_package_for_org", {
      p_org_id: flow.organization_id,
      p_package_id: flow.package_id,
      p_quantity: quantity,
      p_actor_id: actorId,
    });
    if (purchase.error) {
      const msg = purchase.error.message.toLowerCase();
      let reason = "Could not run this flow right now. We will try again on the next run.";
      if (msg.includes("not enough leads")) {
        reason = "Not enough unsold leads are currently available for this package.";
      } else if (msg.includes("insufficient wallet")) {
        reason = "Your wallet balance is too low for this flow.";
      }
      failed.push({
        flow_id: flow.id,
        package_id: flow.package_id,
        package_name: packageName,
        reason,
      });
      continue;
    }

    processed += 1;
    await service
      .from("customer_lead_flows")
      .update({
        last_run_at: new Date().toISOString(),
        next_run_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", flow.id);
  }

  await writeCustomerAuditLog({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    action: "lead_flow_run_triggered",
    entityType: "customer_lead_flow",
    details: { processed, failed_count: failed.length, failed },
  });

  return NextResponse.json({ data: { processed, failed } });
}
