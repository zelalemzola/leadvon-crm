import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireStaffUser, writeAuditLog } from "@/lib/server/admin/auth";
import { organizationGoogleSheetExportSchema } from "@/lib/validation/admin";
import { parseGoogleSpreadsheetId } from "@/lib/server/integrations/google-sheet-lead-format";
import {
  getGoogleSheetsEditorEmail,
  isGoogleSheetsConfigured,
} from "@/lib/integrations/google-sheets";

type RouteParams = { params: Promise<{ id: string }> };

type SheetExportRow = {
  organization_id: string;
  is_active: boolean;
  spreadsheet_id: string;
  sheet_name: string;
  last_synced_at: string | null;
  last_error: string | null;
  activated_at: string | null;
  activated_by: string | null;
  created_at: string;
  updated_at: string;
};

function normalize(row: SheetExportRow | null) {
  if (!row) return null;
  return {
    organization_id: row.organization_id,
    is_active: Boolean(row.is_active),
    spreadsheet_id: row.spreadsheet_id ?? "",
    sheet_name: row.sheet_name?.trim() || "Leads",
    last_synced_at: row.last_synced_at ?? null,
    last_error: row.last_error ?? null,
    activated_at: row.activated_at ?? null,
    activated_by: row.activated_by ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function GET(_request: Request, { params }: RouteParams) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;

  const { id } = await params;
  const service = createServiceClient();
  const { data, error } = await service
    .from("organization_google_sheet_exports")
    .select("*")
    .eq("organization_id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    data: {
      settings: normalize(data as SheetExportRow | null),
      google_sheets_configured: isGoogleSheetsConfigured(),
      editor_email: getGoogleSheetsEditorEmail(),
    },
  });
}

export async function PUT(request: Request, { params }: RouteParams) {
  const staff = await requireStaffUser();
  if ("error" in staff) return staff.error;

  const { id: organizationId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = organizationGoogleSheetExportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((issue) => issue.message).join("; ") },
      { status: 400 }
    );
  }

  const spreadsheetId = parseGoogleSpreadsheetId(parsed.data.spreadsheet_id);
  if (parsed.data.is_active && !spreadsheetId) {
    return NextResponse.json(
      { error: "A valid Google Spreadsheet ID or URL is required when export is enabled." },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { data: org, error: orgError } = await service
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();
  if (orgError) return NextResponse.json({ error: orgError.message }, { status: 400 });
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const existing = await service
    .from("organization_google_sheet_exports")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  const existingRow = normalize(existing.data as SheetExportRow | null);
  const nowIso = new Date().toISOString();
  const turningOn = parsed.data.is_active && !existingRow?.is_active;

  const payload = {
    organization_id: organizationId,
    is_active: parsed.data.is_active,
    spreadsheet_id: spreadsheetId ?? "",
    sheet_name: parsed.data.sheet_name.trim() || "Leads",
    activated_at: turningOn ? nowIso : existingRow?.activated_at ?? null,
    activated_by: turningOn ? staff.userId : existingRow?.activated_by ?? null,
    last_error: parsed.data.is_active ? existingRow?.last_error ?? null : null,
    updated_at: nowIso,
  };

  const { data, error } = await service
    .from("organization_google_sheet_exports")
    .upsert(payload, { onConflict: "organization_id" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAuditLog({
    actorId: staff.userId,
    action: "organization.google_sheet_export.upsert",
    entityType: "organization",
    entityId: organizationId,
    details: {
      is_active: payload.is_active,
      spreadsheet_id: payload.spreadsheet_id,
      sheet_name: payload.sheet_name,
    },
  });

  return NextResponse.json({
    data: {
      settings: normalize(data as SheetExportRow),
      google_sheets_configured: isGoogleSheetsConfigured(),
      editor_email: getGoogleSheetsEditorEmail(),
    },
  });
}
