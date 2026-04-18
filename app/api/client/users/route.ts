import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import {
  requireCustomerUser,
  writeCustomerAuditLog,
} from "@/lib/server/client/auth";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  full_name: z.string().trim().max(150).optional().default(""),
  role: z.enum(["customer_admin", "customer_agent"]),
});

export async function POST(request: Request) {
  const auth = await requireCustomerUser({ adminOnly: true });
  if ("error" in auth) {
    return auth.error;
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    app_metadata: { role: parsed.data.role },
    user_metadata: { full_name: parsed.data.full_name },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (data.user) {
    await service
      .from("profiles")
      .update({
        role: parsed.data.role,
        organization_id: auth.organizationId,
        is_active: true,
        email: parsed.data.email,
        full_name: parsed.data.full_name || null,
      })
      .eq("id", data.user.id);

    await writeCustomerAuditLog({
      organizationId: auth.organizationId,
      actorId: auth.userId,
      action: "customer_user_created",
      entityType: "profile",
      entityId: data.user.id,
      details: { role: parsed.data.role, email: parsed.data.email },
    });
  }
  return NextResponse.json({ data: { ok: true } });
}

export async function GET() {
  const auth = await requireCustomerUser();
  if ("error" in auth) {
    return auth.error;
  }

  const service = createServiceClient();
  const { data: profiles, error: pErr } = await service
    .from("profiles")
    .select("id, email, full_name, role, is_active, created_at, updated_at, organization_id")
    .eq("organization_id", auth.organizationId)
    .order("created_at", { ascending: false });
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });

  const userMap = new Map<string, string | null>();
  const { data: usersPage, error: uErr } = await service.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (!uErr) {
    for (const u of usersPage.users) {
      userMap.set(u.id, u.last_sign_in_at ?? null);
    }
  }

  const rows = (profiles ?? []).map((p) => ({
    ...p,
    last_sign_in_at: userMap.get(p.id) ?? null,
  }));
  return NextResponse.json({ data: rows });
}
