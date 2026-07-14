import { createServiceClient } from "@/lib/supabase/service";
import {
  appendSpreadsheetRows,
  getGoogleSheetsEditorEmail,
  isGoogleSheetsConfigured,
} from "@/lib/integrations/google-sheets";
import { buildGoogleSheetLeadRow } from "@/lib/server/integrations/google-sheet-lead-format";

type OrgSheetConfig = {
  organization_id: string;
  spreadsheet_id: string;
  sheet_name: string;
};

type CustomerLeadRow = {
  id: string;
  organization_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  created_at: string;
  zip_code?: string | null;
  summary?: string | null;
  lead_unit_type?: string | null;
  country?: string | null;
};

async function markOrgSheetStatus(
  service: ReturnType<typeof createServiceClient>,
  organizationId: string,
  patch: { last_synced_at?: string; last_error?: string | null }
) {
  await service
    .from("organization_google_sheet_exports")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId);
}

async function exportPendingForOrg(
  service: ReturnType<typeof createServiceClient>,
  config: OrgSheetConfig,
  batchLimit: number
) {
  const sheetName = config.sheet_name.trim() || "Leads";
  const { data: pending, error: pendingError } = await service.rpc(
    "list_pending_google_sheet_lead_exports",
    {
      p_organization_id: config.organization_id,
      p_limit: batchLimit,
    }
  );

  if (pendingError) {
    await markOrgSheetStatus(service, config.organization_id, {
      last_error: pendingError.message,
    });
    return {
      organizationId: config.organization_id,
      processed: 0,
      exported: 0,
      failed: 0,
      error: pendingError.message,
    };
  }

  const pendingLeads = (pending ?? []) as CustomerLeadRow[];
  let processed = 0;
  let exported = 0;
  let failed = 0;
  let lastError: string | null = null;

  for (const lead of pendingLeads) {
    processed += 1;
    try {
      await appendSpreadsheetRows({
        spreadsheetId: config.spreadsheet_id,
        sheetName,
        range: "A:K",
        values: [buildGoogleSheetLeadRow(lead)],
      });

      const { error: insertError } = await service.from("google_sheet_lead_exports").insert({
        organization_id: config.organization_id,
        customer_lead_id: lead.id,
        spreadsheet_id: config.spreadsheet_id,
      });

      if (insertError) {
        console.error("[google-sheet-export] ledger insert failed", {
          customerLeadId: lead.id,
          message: insertError.message,
        });
        lastError = insertError.message;
        failed += 1;
        continue;
      }

      exported += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[google-sheet-export] append failed", {
        customerLeadId: lead.id,
        organizationId: config.organization_id,
        error: message,
      });
      lastError = message;
      failed += 1;
    }
  }

  if (exported > 0 || failed > 0 || pendingLeads.length === 0) {
    await markOrgSheetStatus(service, config.organization_id, {
      last_synced_at: exported > 0 ? new Date().toISOString() : undefined,
      last_error: failed > 0 ? lastError : null,
    });
  }

  return {
    organizationId: config.organization_id,
    processed,
    exported,
    failed,
    error: lastError,
  };
}

export async function processPendingGoogleSheetLeadExports(batchLimit = 100) {
  if (!isGoogleSheetsConfigured()) {
    return {
      processed: 0,
      exported: 0,
      failed: 0,
      skipped: true as const,
      reason: "google_sheets_not_configured" as const,
      editorEmail: null as string | null,
      orgs: [] as Array<{
        organizationId: string;
        processed: number;
        exported: number;
        failed: number;
        error?: string | null;
      }>,
    };
  }

  const service = createServiceClient();
  const { data: configs, error } = await service
    .from("organization_google_sheet_exports")
    .select("organization_id, spreadsheet_id, sheet_name")
    .eq("is_active", true);

  if (error) {
    return {
      processed: 0,
      exported: 0,
      failed: 0,
      skipped: false as const,
      reason: "config_lookup_failed" as const,
      error: error.message,
      editorEmail: getGoogleSheetsEditorEmail(),
      orgs: [],
    };
  }

  const activeConfigs = ((configs ?? []) as OrgSheetConfig[]).filter(
    (row) => row.spreadsheet_id.trim().length > 0
  );

  let processed = 0;
  let exported = 0;
  let failed = 0;
  const orgs: Array<{
    organizationId: string;
    processed: number;
    exported: number;
    failed: number;
    error?: string | null;
  }> = [];

  for (const config of activeConfigs) {
    const result = await exportPendingForOrg(service, config, batchLimit);
    processed += result.processed;
    exported += result.exported;
    failed += result.failed;
    orgs.push(result);
  }

  return {
    processed,
    exported,
    failed,
    skipped: false as const,
    editorEmail: getGoogleSheetsEditorEmail(),
    orgs,
  };
}
