import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  idempotency_key: z.string().trim().min(8).max(200),
  category_id: z.string().uuid().optional().nullable(),
  organization_id: z.string().uuid().optional().nullable(),
  trigger_source: z.string().trim().min(2).max(80).optional().default("manual"),
});

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const service = createServiceClient();

  const createJob = await service.from("routing_job_runs").insert({
    idempotency_key: parsed.data.idempotency_key,
    category_id: parsed.data.category_id ?? null,
    organization_id: parsed.data.organization_id ?? null,
    trigger_source: parsed.data.trigger_source,
    status: "running",
  });

  if (createJob.error) {
    if (createJob.error.code !== "23505") {
      return NextResponse.json({ error: createJob.error.message }, { status: 400 });
    }
    const existing = await service
      .from("routing_job_runs")
      .select("*")
      .eq("idempotency_key", parsed.data.idempotency_key)
      .maybeSingle();
    if (existing.error) {
      return NextResponse.json({ error: existing.error.message }, { status: 400 });
    }
    return NextResponse.json({
      data: {
        duplicate: true,
        delivered_count: existing.data?.delivered_count ?? 0,
        status: existing.data?.status ?? "completed",
      },
    });
  }

  const run = await service.rpc("run_due_customer_lead_flows", {
    p_organization_id: parsed.data.organization_id ?? null,
    p_category_id: parsed.data.category_id ?? null,
  });

  if (run.error) {
    await service
      .from("routing_job_runs")
      .update({
        status: "failed",
        error_text: run.error.message,
        processed_at: new Date().toISOString(),
      })
      .eq("idempotency_key", parsed.data.idempotency_key);
    return NextResponse.json({ error: run.error.message }, { status: 400 });
  }

  const delivered = typeof run.data === "number" ? run.data : Number(run.data ?? 0);
  await service
    .from("routing_job_runs")
    .update({
      status: "completed",
      delivered_count: delivered,
      processed_at: new Date().toISOString(),
      error_text: null,
    })
    .eq("idempotency_key", parsed.data.idempotency_key);

  return NextResponse.json({
    data: { duplicate: false, delivered_count: delivered, status: "completed" },
  });
}

