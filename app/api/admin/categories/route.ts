import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireStaffUser, writeAuditLog } from "@/lib/server/admin/auth";
import { categorySchema } from "@/lib/validation/admin";

export async function POST(request: Request) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;
  const body = await request.json().catch(() => null);
  const parsed = categorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("categories")
    .insert(parsed.data)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAuditLog({
    actorId: staff.userId,
    action: "category.create",
    entityType: "category",
    entityId: data.id,
  });
  return NextResponse.json({ data });
}

export async function PATCH(request: Request) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const parsed = categorySchema.partial().safeParse(body);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const service = createServiceClient();
  const { data, error } = await service
    .from("categories")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAuditLog({
    actorId: staff.userId,
    action: "category.update",
    entityType: "category",
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
  const { error } = await service.from("categories").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAuditLog({
    actorId: staff.userId,
    action: "category.delete",
    entityType: "category",
    entityId: id,
  });
  return NextResponse.json({ ok: true });
}
