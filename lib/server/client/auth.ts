import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { UserRole } from "@/types/database";

type RequireCustomerUserResult = {
  userId: string;
  role: UserRole;
  organizationId: string;
} | {
  error: NextResponse;
};

export async function requireCustomerUser(options?: { adminOnly?: boolean }): Promise<RequireCustomerUserResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active, organization_id")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role as UserRole | undefined;
  const isCustomer = role === "customer_admin" || role === "customer_agent";
  if (!profile?.is_active || !isCustomer) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (!profile.organization_id) {
    return { error: NextResponse.json({ error: "No organization context" }, { status: 400 }) };
  }
  if (options?.adminOnly && role !== "customer_admin") {
    return { error: NextResponse.json({ error: "Only customer admins can perform this action" }, { status: 403 }) };
  }
  return {
    userId: user.id,
    role,
    organizationId: profile.organization_id,
  };
}

export async function writeCustomerAuditLog(args: {
  organizationId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
}) {
  const service = createServiceClient();
  await service.from("customer_audit_logs").insert({
    organization_id: args.organizationId,
    actor_id: args.actorId,
    action: args.action,
    entity_type: args.entityType,
    entity_id: args.entityId ?? null,
    details: args.details ?? {},
  });
}
