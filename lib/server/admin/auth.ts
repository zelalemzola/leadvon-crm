import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function requireStaffUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const profileRes = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  const profile =
    profileRes.error && profileRes.error.message.includes("is_active")
      ? (
          await supabase
            .from("profiles")
            .select("id, role")
            .eq("id", user.id)
            .maybeSingle()
        ).data
      : profileRes.data;

  const isInactive =
    typeof profile === "object" &&
    profile !== null &&
    "is_active" in profile &&
    (profile as { is_active?: boolean }).is_active === false;

  if (profile?.role !== "staff" || isInactive) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { userId: user.id };
}

export async function writeAuditLog(args: {
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
}) {
  const service = createServiceClient();
  await service.from("admin_audit_logs").insert({
    actor_id: args.actorId,
    action: args.action,
    entity_type: args.entityType,
    entity_id: args.entityId ?? null,
    details: args.details ?? {},
  });
}
