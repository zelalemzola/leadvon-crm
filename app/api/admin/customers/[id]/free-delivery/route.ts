import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireStaffUser, writeAuditLog } from "@/lib/server/admin/auth";
import { organizationFreeDeliverySchema } from "@/lib/validation/admin";
import { processPendingLeadEmails } from "@/lib/server/notifications/dispatch";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;

  const { id } = await params;
  const service = createServiceClient();
  const { data, error } = await service
    .from("organization_free_delivery")
    .select("*")
    .eq("organization_id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data: data ?? null });
}

export async function PUT(request: Request, { params }: RouteParams) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;

  const { id: organizationId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = organizationFreeDeliverySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: org, error: orgError } = await service
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();
  if (orgError) return NextResponse.json({ error: orgError.message }, { status: 400 });
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const existing = await service
    .from("organization_free_delivery")
    .select("is_active, activated_at")
    .eq("organization_id", organizationId)
    .maybeSingle();

  const isActive = parsed.data.is_active;
  const wasActive = existing.data?.is_active === true;
  const activatedAt =
    isActive && !wasActive
      ? new Date().toISOString()
      : isActive
        ? (existing.data?.activated_at ?? new Date().toISOString())
        : null;

  const { data, error } = await service
    .from("organization_free_delivery")
    .upsert(
      {
        organization_id: organizationId,
        is_active: isActive,
        activated_at: activatedAt,
        activated_by: isActive ? staff.userId : null,
      },
      { onConflict: "organization_id" }
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAuditLog({
    actorId: staff.userId,
    action: "customer.free_delivery_upsert",
    entityType: "organization",
    entityId: organizationId,
    details: parsed.data,
  });

  if (isActive) {
    const paidFirst = await service.rpc("run_due_customer_lead_flows", {
      p_category_id: null,
    });
    if (paidFirst.error) {
      return NextResponse.json({ error: paidFirst.error.message }, { status: 400 });
    }

    const distributed = await service.rpc("distribute_free_delivery_leads", {
      p_category_id: null,
    });
    const count =
      distributed.error
        ? 0
        : typeof distributed.data === "number"
          ? distributed.data
          : Number(distributed.data ?? 0);

    const paidCount =
      typeof paidFirst.data === "number" ? paidFirst.data : Number(paidFirst.data ?? 0);

    if (count > 0 || paidCount > 0) {
      await processPendingLeadEmails();
    }
  }

  return NextResponse.json({ data });
}
