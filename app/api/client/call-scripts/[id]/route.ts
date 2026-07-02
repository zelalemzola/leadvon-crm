import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireCustomerUser, writeCustomerAuditLog } from "@/lib/server/client/auth";
import { callScriptPatchSchema } from "@/lib/validation/sms";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireCustomerUser({ adminOnly: true });
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = callScriptPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("customer_call_scripts")
    .update(parsed.data)
    .eq("id", id)
    .eq("organization_id", auth.organizationId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeCustomerAuditLog({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    action: "call_script_updated",
    entityType: "call_script",
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
    .from("customer_call_scripts")
    .delete()
    .eq("id", id)
    .eq("organization_id", auth.organizationId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeCustomerAuditLog({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    action: "call_script_deleted",
    entityType: "call_script",
    entityId: id,
  });

  return NextResponse.json({ data: { ok: true } });
}
