import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireStaffUser, writeAuditLog } from "@/lib/server/admin/auth";
import { updateStaffSchema } from "@/lib/validation/admin";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateStaffSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const service = createServiceClient();
  const payload = parsed.data;

  // Safety: don't allow a staff user to deactivate themselves.
  if (id === staff.userId && payload.is_active === false) {
    return NextResponse.json(
      { error: "You cannot deactivate your own account." },
      { status: 400 }
    );
  }

  if (payload.password) {
    const { error } = await service.auth.admin.updateUserById(id, {
      password: payload.password,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const profilePatch: Record<string, unknown> = {};
  if (payload.role) profilePatch.role = payload.role;
  if (payload.is_active !== undefined) profilePatch.is_active = payload.is_active;
  if (Object.keys(profilePatch).length > 0) {
    const { error } = await service.from("profiles").update(profilePatch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAuditLog({
    actorId: staff.userId,
    action: "staff.update",
    entityType: "staff",
    entityId: id,
    details: {
      ...profilePatch,
      password_reset: Boolean(payload.password),
    },
  });

  return NextResponse.json({ ok: true });
}
