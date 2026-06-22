import { createServiceClient } from "@/lib/supabase/service";
import { processPendingLeadEmails } from "@/lib/server/notifications/dispatch";

export async function processLeadIngestRouting(categoryId: string, ingestKey: string) {
  const service = createServiceClient();

  const runJob = await service.from("routing_job_runs").insert({
    idempotency_key: ingestKey,
    category_id: categoryId,
    trigger_source: "lead_insert",
    status: "running",
  });

  let paidDelivered = 0;
  if (!runJob.error) {
    const routed = await service.rpc("run_due_customer_lead_flows", {
      p_category_id: categoryId,
    });
    if (routed.error) {
      await service
        .from("routing_job_runs")
        .update({
          status: "failed",
          error_text: routed.error.message,
          processed_at: new Date().toISOString(),
        })
        .eq("idempotency_key", ingestKey);
    } else {
      paidDelivered =
        typeof routed.data === "number" ? routed.data : Number(routed.data ?? 0);
      await service
        .from("routing_job_runs")
        .update({
          status: "completed",
          delivered_count: paidDelivered,
          error_text: null,
          processed_at: new Date().toISOString(),
        })
        .eq("idempotency_key", ingestKey);
    }
  }

  const freeTest = await service.rpc("distribute_free_test_leads", {
    p_category_id: categoryId,
  });
  const freeTestDelivered =
    freeTest.error ? 0 : typeof freeTest.data === "number" ? freeTest.data : Number(freeTest.data ?? 0);

  if (paidDelivered > 0 || freeTestDelivered > 0) {
    await processPendingLeadEmails();
  }

  return { paidDelivered, freeTestDelivered };
}
