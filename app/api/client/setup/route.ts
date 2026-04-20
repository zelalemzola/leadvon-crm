import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const schema = z.object({
  organization_name: z.string().trim().min(2).max(150),
  phone: z.string().trim().min(5).max(40),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, is_active, organization_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  if (!profile.is_active) {
    return NextResponse.json({ error: "Inactive account" }, { status: 403 });
  }
  if (profile.role !== "customer_admin" && profile.role !== "customer_agent") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (profile.organization_id) {
    return NextResponse.json({ data: { ok: true } });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: org, error: orgErr } = await service
    .from("organizations")
    .insert({ name: parsed.data.organization_name, phone: parsed.data.phone })
    .select("id")
    .single();
  if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 400 });

  const { error: upErr } = await service
    .from("profiles")
    .update({
      organization_id: org.id,
      role: "customer_admin",
      phone: parsed.data.phone,
    })
    .eq("id", user.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  return NextResponse.json({ data: { ok: true } });
}
