import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireStaffUser, writeAuditLog } from "@/lib/server/admin/auth";
import { organizationFreeDeliverySchema } from "@/lib/validation/admin";
import { processPendingLeadEmails } from "@/lib/server/notifications/dispatch";

type RouteParams = { params: Promise<{ id: string }> };

const FREE_DELIVERY_GRACE_MS = 5 * 60 * 1000;

type FreeDeliveryRow = Record<string, unknown> & {
  organization_id: string;
  quota_total?: number;
  quota_delivered?: number;
  leads_per_day?: number;
  is_active?: boolean;
  activated_at?: string | null;
  activated_by?: string | null;
  eligible_from?: string | null;
  distribute_after?: string | null;
  created_at?: string;
  updated_at?: string;
};

function startOfUtcDayIso(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function normalizeFreeDelivery(row: FreeDeliveryRow | null) {
  if (!row) return null;
  const quotaDelivered = Number(row.quota_delivered ?? 0);
  const quotaTotal = Number(row.quota_total ?? row.leads_per_day ?? 0);
  return {
    ...row,
    quota_total: quotaTotal,
    quota_delivered: quotaDelivered,
    is_active: Boolean(row.is_active),
    eligible_from: row.eligible_from ?? null,
    distribute_after: row.distribute_after ?? null,
  };
}

function distributeAfterIso(date = new Date()) {
  return new Date(date.getTime() + FREE_DELIVERY_GRACE_MS).toISOString();
}

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

  return NextResponse.json({ data: normalizeFreeDelivery(data as FreeDeliveryRow | null) });
}

export async function PUT(request: Request, { params }: RouteParams) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;

  const { id: organizationId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = organizationFreeDeliverySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((issue) => issue.message).join("; ") },
      { status: 400 }
    );
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
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  const existingRow = normalizeFreeDelivery(existing.data as FreeDeliveryRow | null);
  const priorDelivered = existingRow?.quota_delivered ?? 0;
  const priorTotal = existingRow?.quota_total ?? 0;
  const wasComplete = priorTotal > 0 && priorDelivered >= priorTotal;
  const isActive = parsed.data.is_active;
  const wasActive = existingRow?.is_active === true;
  const turningOn = isActive && !wasActive;
  const resumingMidCampaign =
    turningOn && priorDelivered > 0 && priorDelivered < priorTotal;
  const startingNewCampaign = turningOn && !resumingMidCampaign;

  let quotaDelivered = priorDelivered;
  let eligibleFrom =
    existingRow?.eligible_from ?? (startingNewCampaign ? startOfUtcDayIso() : null);

  if (startingNewCampaign) {
    quotaDelivered = 0;
    eligibleFrom = startOfUtcDayIso();
  }

  if (parsed.data.quota_total < quotaDelivered) {
    return NextResponse.json(
      { error: `Total cannot be less than already delivered (${quotaDelivered})` },
      { status: 400 }
    );
  }

  const activatedAt =
    turningOn
      ? new Date().toISOString()
      : isActive
        ? (existingRow?.activated_at ?? new Date().toISOString())
        : null;

  const graceStartsAt = distributeAfterIso();
  const distributeAfter =
    turningOn
      ? graceStartsAt
      : isActive
        ? (existingRow?.distribute_after ?? graceStartsAt)
        : (existingRow?.distribute_after ?? graceStartsAt);

  const { data, error } = await service
    .from("organization_free_delivery")
    .upsert(
      {
        organization_id: organizationId,
        quota_total: parsed.data.quota_total,
        quota_delivered: quotaDelivered,
        eligible_from: eligibleFrom ?? startOfUtcDayIso(),
        distribute_after: distributeAfter,
        is_active: isActive && quotaDelivered < parsed.data.quota_total,
        activated_at: activatedAt,
        activated_by: isActive ? staff.userId : null,
      },
      { onConflict: "organization_id" }
    )
    .select("*")
    .single();

  if (error) {
    const hint =
      error.message.includes("quota_total") ||
      error.message.includes("eligible_from") ||
      error.message.includes("distribute_after") ||
      error.message.includes("schema")
        ? `${error.message} Run migrations 20260625160000 through 20260626130000 in Supabase.`
        : error.message;
    return NextResponse.json({ error: hint }, { status: 400 });
  }

  if (turningOn && isActive) {
    const extendGrace = await service
      .from("organization_free_delivery")
      .update({ distribute_after: graceStartsAt })
      .eq("is_active", true);
    if (extendGrace.error) {
      return NextResponse.json({ error: extendGrace.error.message }, { status: 400 });
    }
  }

  await writeAuditLog({
    actorId: staff.userId,
    action: "customer.free_delivery_upsert",
    entityType: "organization",
    entityId: organizationId,
    details: { ...parsed.data, starting_new_campaign: startingNewCampaign },
  });

  const normalized = normalizeFreeDelivery(data as FreeDeliveryRow);

  if (normalized?.is_active) {
    const paidFirst = await service.rpc("run_due_customer_lead_flows", {
      p_category_id: null,
    });
    if (paidFirst.error) {
      return NextResponse.json({ error: paidFirst.error.message }, { status: 400 });
    }

    const distributed = await service.rpc("distribute_free_delivery_leads", {
      p_category_id: null,
    });
    if (distributed.error) {
      return NextResponse.json({ error: distributed.error.message }, { status: 400 });
    }

    const count =
      typeof distributed.data === "number" ? distributed.data : Number(distributed.data ?? 0);
    const paidCount =
      typeof paidFirst.data === "number" ? paidFirst.data : Number(paidFirst.data ?? 0);

    if (count > 0 || paidCount > 0) {
      await processPendingLeadEmails();
    }

    const refreshed = await service
      .from("organization_free_delivery")
      .select("*")
      .eq("organization_id", organizationId)
      .single();
    if (!refreshed.error && refreshed.data) {
      return NextResponse.json({ data: normalizeFreeDelivery(refreshed.data as FreeDeliveryRow) });
    }
  }

  return NextResponse.json({ data: normalized });
}
