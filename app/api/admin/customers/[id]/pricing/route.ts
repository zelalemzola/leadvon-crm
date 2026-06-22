import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireStaffUser, writeAuditLog } from "@/lib/server/admin/auth";
import { organizationPricingOverrideSchema } from "@/lib/validation/admin";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;

  const { id } = await params;
  const service = createServiceClient();
  const { data, error } = await service
    .from("organization_pricing_overrides")
    .select("*")
    .eq("organization_id", id)
    .order("unit_type", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data: data ?? [] });
}

export async function PUT(request: Request, { params }: RouteParams) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;

  const { id: organizationId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = organizationPricingOverrideSchema.safeParse(body);
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

  const { data, error } = await service
    .from("organization_pricing_overrides")
    .upsert(
      {
        organization_id: organizationId,
        category_id: parsed.data.category_id,
        unit_type: parsed.data.unit_type,
        price_cents: parsed.data.price_cents,
        active: parsed.data.active,
      },
      { onConflict: "organization_id,category_id,unit_type" }
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAuditLog({
    actorId: staff.userId,
    action: "customer.pricing_override_upsert",
    entityType: "organization",
    entityId: organizationId,
    details: parsed.data,
  });

  return NextResponse.json({ data });
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;

  const { id: organizationId } = await params;
  const body = await request.json().catch(() => null);
  const categoryId =
    body && typeof body === "object" && "category_id" in body
      ? String((body as { category_id?: unknown }).category_id ?? "")
      : "";
  const unitType =
    body && typeof body === "object" && "unit_type" in body
      ? String((body as { unit_type?: unknown }).unit_type ?? "")
      : "";

  if (!categoryId || (unitType !== "single" && unitType !== "family")) {
    return NextResponse.json({ error: "category_id and unit_type are required" }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from("organization_pricing_overrides")
    .delete()
    .eq("organization_id", organizationId)
    .eq("category_id", categoryId)
    .eq("unit_type", unitType);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAuditLog({
    actorId: staff.userId,
    action: "customer.pricing_override_delete",
    entityType: "organization",
    entityId: organizationId,
    details: { category_id: categoryId, unit_type: unitType },
  });

  return NextResponse.json({ data: { ok: true } });
}
