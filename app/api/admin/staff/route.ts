import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireStaffUser, writeAuditLog } from "@/lib/server/admin/auth";
import { inviteStaffSchema } from "@/lib/validation/admin";

export async function POST(request: Request) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;
  const body = await request.json().catch(() => null);
  const parsed = inviteStaffSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { email, password, full_name } = parsed.data;
  const admin = createServiceClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "staff" },
    user_metadata: { full_name },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (data.user) {
    await admin
      .from("profiles")
      .update({
        role: "staff",
        is_active: true,
        email,
        full_name: full_name || null,
      })
      .eq("id", data.user.id);

    await writeAuditLog({
      actorId: staff.userId,
      action: "staff.create",
      entityType: "staff",
      entityId: data.user.id,
      details: { email },
    });
  }

  return NextResponse.json({ ok: true });
}
