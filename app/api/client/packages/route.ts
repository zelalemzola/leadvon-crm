import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireCustomerUser } from "@/lib/server/client/auth";

/** Active catalog packages for the client portal (bypasses RLS; session required). */
export async function GET() {
  const auth = await requireCustomerUser();
  if ("error" in auth) return auth.error;

  const service = createServiceClient();
  const { data, error } = await service
    .from("lead_packages")
    .select("*, categories(id, name, slug)")
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const rows = data ?? [];
  const uniqueCategoryIds = [...new Set(rows.map((r) => r.category_id).filter(Boolean))] as string[];
  const availability = new Map<string, number>();
  await Promise.all(
    uniqueCategoryIds.map(async (categoryId) => {
      const c = await service
        .from("leads")
        .select("*", { head: true, count: "exact" })
        .eq("category_id", categoryId)
        .is("sold_at", null);
      availability.set(categoryId, c.count ?? 0);
    })
  );

  const withAvailability = rows.map((r) => ({
    ...r,
    available_unsold_leads: availability.get(r.category_id) ?? 0,
  }));
  return NextResponse.json({ data: withAvailability });
}
