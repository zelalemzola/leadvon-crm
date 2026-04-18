import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireStaffUser, writeAuditLog } from "@/lib/server/admin/auth";
import { supportContactSchema } from "@/lib/validation/admin";

export async function GET() {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;

  const service = createServiceClient();
  const { data, error } = await service
    .from("support_contacts")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;

  const body = await request.json().catch(() => null);
  const parsed = supportContactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("support_contacts")
    .insert({
      title: parsed.data.title,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      description: parsed.data.description,
      sort_order: parsed.data.sort_order,
      organization_id: parsed.data.organization_id ?? null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAuditLog({
    actorId: staff.userId,
    action: "support_contact.create",
    entityType: "support_contact",
    entityId: data.id,
  });
  return NextResponse.json({ data });
}
