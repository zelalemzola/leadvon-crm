import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireCustomerUser } from "@/lib/server/client/auth";

/** Active offers for the client portal (bypasses RLS; session required). */
export async function GET() {
  const auth = await requireCustomerUser();
  if ("error" in auth) return auth.error;

  const service = createServiceClient();
  const { data, error } = await service
    .from("lead_offers")
    .select("*, lead_packages(id, name, category_id)")
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data: data ?? [] });
}
