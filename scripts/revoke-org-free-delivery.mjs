/**
 * Return free-delivery leads to inventory for one organization and stop delivery.
 *
 * Usage:
 *   node scripts/revoke-org-free-delivery.mjs "VacsSA Pty Ltd"
 *   node scripts/revoke-org-free-delivery.mjs --org-id <uuid>
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const path = ".env.local";
  if (!fs.existsSync(path)) throw new Error("Missing .env.local");
  const env = {};
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i);
    let val = line.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const args = process.argv.slice(2);
const orgIdArg = args[0] === "--org-id" ? args[1] : null;
const orgNameArg = orgIdArg ? null : args.join(" ").trim();

if (!orgIdArg && !orgNameArg) {
  console.error('Usage: node scripts/revoke-org-free-delivery.mjs "<organization name>"');
  console.error("   or: node scripts/revoke-org-free-delivery.mjs --org-id <uuid>");
  process.exit(1);
}

const env = loadEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key);

async function main() {
  let organizationId = orgIdArg;

  if (!organizationId) {
    const { data: orgs, error } = await sb
      .from("organizations")
      .select("id, name")
      .ilike("name", `%${orgNameArg}%`)
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) throw new Error(error.message);
    if (!orgs?.length) throw new Error(`No organization matched "${orgNameArg}"`);
    if (orgs.length > 1) {
      console.log("Multiple matches — using the newest:");
      for (const org of orgs) console.log(`  - ${org.name} (${org.id})`);
    }
    organizationId = orgs[0].id;
    console.log(`Organization: ${orgs[0].name} (${organizationId})`);
  }

  const { data: campaignLeads, error: leadsError } = await sb
    .from("customer_leads")
    .select("id, source_lead_id, first_name, last_name, phone, created_at")
    .eq("organization_id", organizationId)
    .eq("grant_source", "free_delivery");
  if (leadsError) throw new Error(leadsError.message);

  const rows = campaignLeads ?? [];
  if (rows.length === 0) {
    console.log("No free-delivery customer leads found for this organization.");
  } else {
    console.log(`Found ${rows.length} free-delivery lead(s) to revoke.`);
  }

  const sourceLeadIds = [...new Set(rows.map((r) => r.source_lead_id).filter(Boolean))];
  const customerLeadIds = rows.map((r) => r.id);

  if (sourceLeadIds.length > 0) {
    const { error: unsellError } = await sb
      .from("leads")
      .update({ sold_at: null })
      .in("id", sourceLeadIds);
    if (unsellError) throw new Error(`Unsell leads: ${unsellError.message}`);
    console.log(`Returned ${sourceLeadIds.length} source lead(s) to inventory.`);
  }

  if (customerLeadIds.length > 0) {
    const { error: notifError } = await sb
      .from("customer_notifications")
      .delete()
      .eq("entity_type", "customer_lead")
      .in("entity_id", customerLeadIds);
    if (notifError) throw new Error(`Delete notifications: ${notifError.message}`);

    const { error: deleteError } = await sb
      .from("customer_leads")
      .delete()
      .in("id", customerLeadIds);
    if (deleteError) throw new Error(`Delete customer leads: ${deleteError.message}`);
    console.log(`Removed ${customerLeadIds.length} customer_lead row(s).`);
  }

  const { data: deliveryRow, error: deliveryReadError } = await sb
    .from("organization_free_delivery")
    .select("quota_total, quota_delivered, is_active")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (deliveryReadError) throw new Error(deliveryReadError.message);

  if (deliveryRow) {
    const removed = rows.length;
    const nextDelivered = Math.max(0, Number(deliveryRow.quota_delivered ?? 0) - removed);
    const { error: deliveryUpdateError } = await sb
      .from("organization_free_delivery")
      .update({
        quota_delivered: nextDelivered,
        is_active: false,
      })
      .eq("organization_id", organizationId);
    if (deliveryUpdateError) throw new Error(deliveryUpdateError.message);
    console.log(
      `Free delivery disabled. quota_delivered: ${deliveryRow.quota_delivered} -> ${nextDelivered}`
    );
  } else {
    console.log("No organization_free_delivery row (nothing to disable).");
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
