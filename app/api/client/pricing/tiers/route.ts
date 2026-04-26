import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireCustomerUser } from "@/lib/server/client/auth";

export async function GET(request: Request) {
  const auth = await requireCustomerUser();
  if ("error" in auth) {
    return auth.error;
  }

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("category_id");
  if (!categoryId) {
    return NextResponse.json({ error: "category_id is required" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("category_pricing_tiers")
    .select("id, category_id, min_qty, max_qty, is_active")
    .eq("category_id", categoryId)
    .eq("is_active", true)
    .order("min_qty", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const tiers = data ?? [];
  const tierIds = tiers.map((tier) => tier.id);
  let unitTypes: string[] = [];
  if (tierIds.length > 0) {
    const rates = await service
      .from("category_pricing_tier_rates")
      .select("unit_type")
      .in("tier_id", tierIds);
    if (rates.error) return NextResponse.json({ error: rates.error.message }, { status: 400 });
    unitTypes = [...new Set((rates.data ?? []).map((row) => String(row.unit_type)).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b)
    );
  }
  return NextResponse.json({ data: { tiers, unit_types: unitTypes } });
}
