import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireStaffUser, writeAuditLog } from "@/lib/server/admin/auth";
import { createCustomerSchema } from "@/lib/validation/admin";

export async function POST(request: Request) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;

  const body = await request.json().catch(() => null);
  const parsed = createCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, password, full_name, organization_name, phone } = parsed.data;
  const admin = createServiceClient();

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "customer_admin" },
    user_metadata: { full_name },
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }
  if (!authUser.user) {
    return NextResponse.json({ error: "Could not create user" }, { status: 500 });
  }

  const phoneValue = phone?.trim() || null;
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({
      name: organization_name,
      phone: phoneValue,
    })
    .select("id")
    .single();

  if (orgError) {
    await admin.auth.admin.deleteUser(authUser.user.id);
    return NextResponse.json({ error: orgError.message }, { status: 400 });
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      role: "customer_admin",
      is_active: true,
      email,
      full_name: full_name || null,
      organization_id: org.id,
      phone: phoneValue,
    })
    .eq("id", authUser.user.id);

  if (profileError) {
    await admin.from("organizations").delete().eq("id", org.id);
    await admin.auth.admin.deleteUser(authUser.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  await writeAuditLog({
    actorId: staff.userId,
    action: "customer.create",
    entityType: "organization",
    entityId: org.id,
    details: { email, organization_name, user_id: authUser.user.id },
  });

  return NextResponse.json({
    data: {
      ok: true,
      organization_id: org.id,
      user_id: authUser.user.id,
      email,
    },
  });
}
