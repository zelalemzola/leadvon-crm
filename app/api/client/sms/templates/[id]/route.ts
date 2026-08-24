import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireCustomerUser, writeCustomerAuditLog } from "@/lib/server/client/auth";
import { smsTemplatePatchSchema } from "@/lib/validation/sms";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireCustomerUser({ adminOnly: true });
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = smsTemplatePatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const updatePayload: { name?: string; body?: string } = {};
  if (parsed.data.name !== undefined) updatePayload.name = parsed.data.name.trim();
  if (parsed.data.body !== undefined) updatePayload.body = parsed.data.body.trim();

  const service = createServiceClient();
  const { data, error } = await service
    .from("sms_templates")
    .update(updatePayload)
    .eq("id", id)
    .eq("organization_id", auth.organizationId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeCustomerAuditLog({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    action: "sms_template_updated",
    entityType: "sms_template",
    entityId: id,
    details: updatePayload,
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
    .from("sms_templates")
    .delete()
    .eq("id", id)
    .eq("organization_id", auth.organizationId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeCustomerAuditLog({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    action: "sms_template_deleted",
    entityType: "sms_template",
    entityId: id,
  });

  return NextResponse.json({ data: { ok: true } });
}
