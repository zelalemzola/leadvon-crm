import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireStaffUser, writeAuditLog } from "@/lib/server/admin/auth";
import { packageSchema } from "@/lib/validation/admin";

export async function POST(request: Request) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;
  const body = await request.json().catch(() => null);
  const parsed = packageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const service = createServiceClient();
  const { data, error } = await service
    .from("lead_packages")
    .insert(parsed.data)
    .select("*, categories(id, name, slug)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAuditLog({
    actorId: staff.userId,
    action: "package.create",
    entityType: "package",
    entityId: data.id,
  });
  return NextResponse.json({ data });
}

export async function PATCH(request: Request) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const parsed = packageSchema.partial().safeParse(body);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const service = createServiceClient();
  const { data, error } = await service
    .from("lead_packages")
    .update(parsed.data)
    .eq("id", id)
    .select("*, categories(id, name, slug)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAuditLog({
    actorId: staff.userId,
    action: "package.update",
    entityType: "package",
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
  const { error } = await service.from("lead_packages").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAuditLog({
    actorId: staff.userId,
    action: "package.delete",
    entityType: "package",
    entityId: id,
  });
  return NextResponse.json({ ok: true });
}
