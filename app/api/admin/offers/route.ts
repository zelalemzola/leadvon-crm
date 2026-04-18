import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireStaffUser, writeAuditLog } from "@/lib/server/admin/auth";
import { offerSchema } from "@/lib/validation/admin";

export async function GET() {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;
  const service = createServiceClient();
  const { data, error } = await service
    .from("lead_offers")
    .select("*, lead_packages(id, name, category_id)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;
  const body = await request.json().catch(() => null);
  const parsed = offerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const service = createServiceClient();
  const { data, error } = await service
    .from("lead_offers")
    .insert(parsed.data)
    .select("*, lead_packages(id, name, category_id)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAuditLog({
    actorId: staff.userId,
    action: "offer.create",
    entityType: "offer",
    entityId: data.id,
  });
  return NextResponse.json({ data });
}

export async function PATCH(request: Request) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const parsed = offerSchema.partial().safeParse(body);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const service = createServiceClient();
  const { data, error } = await service
    .from("lead_offers")
    .update(parsed.data)
    .eq("id", id)
    .select("*, lead_packages(id, name, category_id)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAuditLog({
    actorId: staff.userId,
    action: "offer.update",
    entityType: "offer",
    entityId: id,
    details: parsed.data as Record<string, unknown>,
  });
  return NextResponse.json({ data });
}

export async function DELETE(request: Request) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const service = createServiceClient();
  const { error } = await service.from("lead_offers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAuditLog({
    actorId: staff.userId,
    action: "offer.delete",
    entityType: "offer",
    entityId: id,
  });
  return NextResponse.json({ ok: true });
}
