import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { requireStaffUser, writeAuditLog } from "@/lib/server/admin/auth";

const schema = z.object({
  organization_name: z.string().trim().min(2).max(150),
  phone: z.string().trim().max(40).nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: profile, error: profileErr } = await service
    .from("profiles")
    .select("id, role, organization_id, email, full_name, is_active")
    .eq("id", id)
    .maybeSingle();
  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 400 });
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  if (profile.role !== "customer_admin" && profile.role !== "customer_agent") {
    return NextResponse.json({ error: "Only customer users can be linked." }, { status: 400 });
  }
  if (profile.organization_id) {
    return NextResponse.json({ data: { ok: true, organization_id: profile.organization_id } });
  }

  const phone = parsed.data.phone?.trim() || null;
  const { data: org, error: orgErr } = await service
    .from("organizations")
    .insert({
      name: parsed.data.organization_name,
      phone,
    })
    .select("id")
    .single();
  if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 400 });

  const { error: linkErr } = await service
    .from("profiles")
    .update({
      organization_id: org.id,
      role: "customer_admin",
      phone,
      is_active: true,
    })
    .eq("id", profile.id);
  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 400 });

  await writeAuditLog({
    actorId: staff.userId,
    action: "customer.organization_linked",
    entityType: "profile",
    entityId: profile.id,
    details: {
      organization_id: org.id,
      organization_name: parsed.data.organization_name,
      phone,
      email: profile.email,
    },
  });

  return NextResponse.json({ data: { ok: true, organization_id: org.id } });
}
