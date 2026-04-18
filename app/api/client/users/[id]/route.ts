import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import {
  requireCustomerUser,
  writeCustomerAuditLog,
} from "@/lib/server/client/auth";

const schema = z.object({
  is_active: z.boolean().optional(),
  role: z.enum(["customer_admin", "customer_agent"]).optional(),
  password: z.string().min(8).max(128).optional(),
  send_password_reset: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const me = await requireCustomerUser({ adminOnly: true });
  if ("error" in me) {
    return me.error;
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (
    parsed.data.is_active === undefined &&
    !parsed.data.role &&
    !parsed.data.password &&
    !parsed.data.send_password_reset
  ) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  if (id === me.userId && parsed.data.is_active === false) {
    return NextResponse.json(
      { error: "You cannot deactivate your own account." },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { data: target } = await service
    .from("profiles")
    .select("id, organization_id, role, is_active")
    .eq("id", id)
    .maybeSingle();
  if (!target || target.organization_id !== me.organizationId) {
    return NextResponse.json({ error: "User not found in organization" }, { status: 404 });
  }

  const nextRole = parsed.data.role ?? target.role;
  const nextIsActive =
    parsed.data.is_active === undefined ? Boolean(target.is_active) : parsed.data.is_active;
  if (target.role === "customer_admin" && (!nextIsActive || nextRole !== "customer_admin")) {
    const { count } = await service
      .from("profiles")
      .select("*", { head: true, count: "exact" })
      .eq("organization_id", me.organizationId)
      .eq("role", "customer_admin")
      .eq("is_active", true)
      .neq("id", id);
    if ((count ?? 0) < 1) {
      return NextResponse.json(
        { error: "At least one active customer admin is required." },
        { status: 400 }
      );
    }
  }

  const updatePayload: { is_active?: boolean; role?: "customer_admin" | "customer_agent" } = {};
  if (parsed.data.is_active !== undefined) updatePayload.is_active = parsed.data.is_active;
  if (parsed.data.role) updatePayload.role = parsed.data.role;

  const { error: upErr } = await service
    .from("profiles")
    .update(updatePayload)
    .eq("id", id)
    .eq("organization_id", me.organizationId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  if (parsed.data.password) {
    const { error } = await service.auth.admin.updateUserById(id, {
      password: parsed.data.password,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  let resetLink: string | null = null;
  if (parsed.data.send_password_reset) {
    const { data: targetEmailRow } = await service
      .from("profiles")
      .select("email")
      .eq("id", id)
      .maybeSingle();
    const targetEmail = targetEmailRow?.email ?? null;
    if (targetEmail) {
      const reset = await service.auth.admin.generateLink({
        type: "recovery",
        email: targetEmail,
      });
      if (!reset.error) {
        resetLink = reset.data.properties?.action_link ?? null;
      }
    }
  }

  await writeCustomerAuditLog({
    organizationId: me.organizationId,
    actorId: me.userId,
    action: "customer_user_updated",
    entityType: "profile",
    entityId: id,
    details: {
      is_active: parsed.data.is_active,
      role: parsed.data.role,
      password_reset_sent: Boolean(parsed.data.send_password_reset),
      password_changed: Boolean(parsed.data.password),
    },
  });

  return NextResponse.json({ data: { ok: true, reset_link: resetLink } });
}
