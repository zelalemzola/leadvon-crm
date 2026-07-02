import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireCustomerUser, writeCustomerAuditLog } from "@/lib/server/client/auth";
import { smsAutomationSchema } from "@/lib/validation/sms";

export async function GET() {
  const auth = await requireCustomerUser();
  if ("error" in auth) return auth.error;

  const service = createServiceClient();
  const { data, error } = await service
    .from("sms_automations")
    .select("*")
    .eq("organization_id", auth.organizationId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireCustomerUser({ adminOnly: true });
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = smsAutomationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("sms_automations")
    .insert({
      organization_id: auth.organizationId,
      created_by: auth.userId,
      ...parsed.data,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeCustomerAuditLog({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    action: "sms_automation_created",
    entityType: "sms_automation",
    entityId: data.id,
    details: { trigger_status: parsed.data.trigger_status, name: parsed.data.name },
  });

  return NextResponse.json({ data });
}
