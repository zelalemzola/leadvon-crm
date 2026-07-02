import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireCustomerUser, writeCustomerAuditLog } from "@/lib/server/client/auth";
import { smsAutomationPatchSchema } from "@/lib/validation/sms";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireCustomerUser({ adminOnly: true });
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = smsAutomationPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("sms_automations")
    .update(parsed.data)
    .eq("id", id)
    .eq("organization_id", auth.organizationId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeCustomerAuditLog({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    action: "sms_automation_updated",
    entityType: "sms_automation",
    entityId: id,
    details: parsed.data,
  });

  return NextResponse.json({ data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireCustomerUser({ adminOnly: true });
  if ("error" in auth) return auth.error;

  const service = createServiceClient();
  const { error } = await service
    .from("sms_automations")
    .delete()
    .eq("id", id)
    .eq("organization_id", auth.organizationId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeCustomerAuditLog({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    action: "sms_automation_deleted",
    entityType: "sms_automation",
    entityId: id,
  });

  return NextResponse.json({ data: { ok: true } });
}
