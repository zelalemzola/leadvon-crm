import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireStaffUser } from "@/lib/server/admin/auth";

type RouteParams = { params: Promise<{ id: string }> };

type CategoryRef = { id: string; name: string };

function pickCategory(
  categories: CategoryRef | CategoryRef[] | null | undefined
): CategoryRef | null {
  if (!categories) return null;
  return Array.isArray(categories) ? (categories[0] ?? null) : categories;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;

  const { id: organizationId } = await params;
  const service = createServiceClient();

  const { data: org, error: orgError } = await service
    .from("organizations")
    .select("id, name")
    .eq("id", organizationId)
    .maybeSingle();
  if (orgError) return NextResponse.json({ error: orgError.message }, { status: 400 });
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const { data, error } = await service
    .from("customer_leads")
    .select(
      "id, source_lead_id, phone, first_name, last_name, country, grant_source, created_at, categories(id, name)"
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = (data ?? []).map((row) => {
    const category = pickCategory(row.categories as CategoryRef | CategoryRef[] | null);
    return {
      id: row.id,
      source_lead_id: row.source_lead_id,
      phone: row.phone,
      first_name: row.first_name,
      last_name: row.last_name,
      country: row.country,
      grant_source: row.grant_source ?? "paid",
      created_at: row.created_at,
      category_id: category?.id ?? null,
      category_name: category?.name ?? null,
    };
  });

  const summary = {
    total: rows.length,
    paid: rows.filter((r) => r.grant_source === "paid").length,
    free_delivery: rows.filter((r) => r.grant_source === "free_delivery").length,
    signup_free: rows.filter((r) =>
      ["signup_free", "free_test"].includes(r.grant_source)
    ).length,
  };

  return NextResponse.json({
    data: {
      organization_id: organizationId,
      organization_name: org.name,
      summary,
      leads: rows,
    },
  });
}
