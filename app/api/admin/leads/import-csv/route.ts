import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireStaffUser, writeAuditLog } from "@/lib/server/admin/auth";
import { leadCsvImportRequestSchema } from "@/lib/validation/admin";
import { processLeadIngestRouting } from "@/lib/server/routing/process-lead-ingest";

export async function POST(request: Request) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;

  const body = await request.json().catch(() => null);
  const parsed = leadCsvImportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const service = createServiceClient();
  const insertedIds: string[] = [];
  const categoryIds = new Set<string>();
  const failed: { index: number; error: string }[] = [];

  for (const [index, row] of parsed.data.rows.entries()) {
    const { data, error } = await service
      .from("leads")
      .insert({
        category_id: row.category_id,
        lead_unit_type: row.lead_unit_type ?? "single",
        phone: row.phone,
        first_name: row.first_name,
        last_name: row.last_name,
        country: row.country,
        summary: row.summary ?? "",
        zip_code: row.zip_code ?? null,
        source_system: "manual",
      })
      .select("id, category_id")
      .single();

    if (error || !data) {
      failed.push({ index, error: error?.message ?? "Insert failed" });
      continue;
    }

    insertedIds.push(data.id);
    categoryIds.add(data.category_id);
  }

  for (const categoryId of categoryIds) {
    await processLeadIngestRouting(categoryId, `lead-csv-import:${categoryId}`);
  }

  if (insertedIds.length > 0) {
    await writeAuditLog({
      actorId: staff.userId,
      action: "lead.import_csv",
      entityType: "lead",
      entityId: insertedIds[0]!,
      details: {
        imported: insertedIds.length,
        failed: failed.length,
        lead_ids: insertedIds.slice(0, 50),
      },
    });
  }

  return NextResponse.json({
    imported: insertedIds.length,
    failed,
  });
}
