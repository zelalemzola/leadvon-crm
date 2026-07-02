import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireCustomerUser } from "@/lib/server/client/auth";

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const auth = await requireCustomerUser();
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const categoryId = url.searchParams.get("category_id");
  const country = url.searchParams.get("country");
  const unitType = url.searchParams.get("unit_type");
  const status = url.searchParams.get("status");
  const assignedTo = url.searchParams.get("assigned_to");

  const service = createServiceClient();
  let q = service
    .from("customer_leads")
    .select(
      "*, categories(name), assignee:profiles!customer_leads_assigned_to_fkey(full_name, email)"
    )
    .eq("organization_id", auth.organizationId)
    .order("created_at", { ascending: false })
    .limit(10000);

  if (categoryId) q = q.eq("category_id", categoryId);
  if (country && country !== "all") q = q.eq("country", country);
  if (unitType && unitType !== "all") q = q.eq("lead_unit_type", unitType);
  if (status && status !== "all") q = q.eq("status", status);
  if (assignedTo && assignedTo !== "all") q = q.eq("assigned_to", assignedTo);
  if (search) {
    q = q.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%,summary.ilike.%${search}%,notes.ilike.%${search}%,id.ilike.%${search}%`
    );
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const headers = [
    "id",
    "first_name",
    "last_name",
    "phone",
    "zip_code",
    "country",
    "lead_unit_type",
    "category",
    "status",
    "assignee",
    "call_count",
    "summary",
    "notes",
    "created_at",
    "status_updated_at",
    "first_contacted_at",
    "updated_at",
  ];

  const lines = (data ?? []).map((row) => {
    const assignee =
      (row as { assignee?: { full_name?: string; email?: string } | null }).assignee?.full_name ||
      (row as { assignee?: { full_name?: string; email?: string } | null }).assignee?.email ||
      "";
    const category =
      (row as { categories?: { name?: string } | null }).categories?.name ?? "";

    return [
      row.id,
      row.first_name,
      row.last_name,
      row.phone,
      row.zip_code ?? row.postal_code ?? "",
      row.country ?? "",
      row.lead_unit_type ?? "single",
      category,
      row.status,
      assignee,
      row.call_count ?? 0,
      row.summary ?? "",
      row.notes ?? "",
      row.created_at,
      row.status_updated_at,
      row.first_contacted_at ?? "",
      row.updated_at,
    ]
      .map(csvEscape)
      .join(",");
  });

  const csv = [headers.join(","), ...lines].join("\n");
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="customer-leads-export-${stamp}.csv"`,
    },
  });
}
