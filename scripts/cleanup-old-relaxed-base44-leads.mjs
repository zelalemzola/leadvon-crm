/**
 * Cleanup pre-today Base44 leads that only synced because gates were relaxed.
 * Mirrors supabase/scripts/cleanup-old-relaxed-base44-leads.sql
 *
 * Usage: node scripts/cleanup-old-relaxed-base44-leads.mjs
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    env[line.slice(0, i)] = v;
  }
  return env;
}

function startOfUtcDayIso(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function failsGates(lead) {
  const phone = String(lead.phone ?? "").trim();
  const first = String(lead.first_name ?? "").trim();
  const last = String(lead.last_name ?? "").trim();
  const status = String(lead.source_payload?.status ?? "")
    .trim()
    .toLowerCase();
  return (
    !phone ||
    (!first && !last) ||
    status !== "new"
  );
}

const env = loadEnv();
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const cutoff = startOfUtcDayIso();
console.log("Cutoff (UTC today):", cutoff);

const { data: candidates, error: listError } = await sb
  .from("leads")
  .select(
    "id,source_system,source_external_id,source_created_at,created_at,phone,first_name,last_name,source_payload,sold_at"
  )
  .eq("source_system", "base44")
  .lt("source_created_at", cutoff)
  .limit(5000);

if (listError) throw new Error(listError.message);

const targets = (candidates || []).filter(failsGates);
console.log("Old base44 candidates:", candidates?.length ?? 0);
console.log("Old relaxed-gate targets:", targets.length);

if (targets.length === 0) {
  console.log("Nothing to clean.");
  process.exit(0);
}

const targetIds = targets.map((t) => t.id);
const externalIds = targets
  .map((t) => t.source_external_id)
  .filter(Boolean);

const { data: customerLeads, error: clError } = await sb
  .from("customer_leads")
  .select("id,organization_id,grant_source,source_lead_id")
  .in("source_lead_id", targetIds);
if (clError) throw new Error(clError.message);

const clRows = customerLeads || [];
const clIds = clRows.map((c) => c.id);
const freeByOrg = new Map();
for (const cl of clRows) {
  if (cl.grant_source !== "free_delivery") continue;
  freeByOrg.set(cl.organization_id, (freeByOrg.get(cl.organization_id) || 0) + 1);
}

console.log("Customer lead copies:", clRows.length);
console.log(
  "Free-delivery by org:",
  Object.fromEntries(freeByOrg.entries())
);

// 1) Exclusions
if (externalIds.length) {
  const rows = externalIds.map((external_id) => ({
    provider: "base44",
    external_id,
    reason: "temp_relaxed_gates_pre_today_cleanup",
  }));
  const { error } = await sb.from("external_sync_exclusions").upsert(rows, {
    onConflict: "provider,external_id",
  });
  if (error) throw new Error(`exclusions: ${error.message}`);
  console.log("Excluded external ids:", rows.length);
}

// 2) Notifications
if (clIds.length) {
  const { error } = await sb
    .from("customer_notifications")
    .delete()
    .eq("entity_type", "customer_lead")
    .in("entity_id", clIds);
  if (error) throw new Error(`notifications: ${error.message}`);
}

// 3) Routing events
{
  const { error } = await sb
    .from("delivery_routing_events")
    .delete()
    .in("source_lead_id", targetIds);
  if (error) throw new Error(`routing: ${error.message}`);
}

// 4) Customer leads
if (clIds.length) {
  const { error } = await sb.from("customer_leads").delete().in("id", clIds);
  if (error) throw new Error(`customer_leads: ${error.message}`);
  console.log("Deleted customer_leads:", clIds.length);
}

// 5) Source leads
{
  const { error } = await sb.from("leads").delete().in("id", targetIds);
  if (error) throw new Error(`leads: ${error.message}`);
  console.log("Deleted source leads:", targetIds.length);
}

// 6) Fix free-delivery quotas + re-enable
for (const [organization_id, freeRevoked] of freeByOrg.entries()) {
  const { data: campaign, error: campError } = await sb
    .from("organization_free_delivery")
    .select("*")
    .eq("organization_id", organization_id)
    .maybeSingle();
  if (campError) throw new Error(campError.message);
  if (!campaign) continue;

  const nextDelivered = Math.max(0, Number(campaign.quota_delivered || 0) - freeRevoked);
  const nextActive =
    Number(campaign.quota_total || 0) > 0 && nextDelivered < Number(campaign.quota_total)
      ? true
      : campaign.is_active;

  const { data: updated, error: updError } = await sb
    .from("organization_free_delivery")
    .update({
      quota_delivered: nextDelivered,
      is_active: nextActive,
      distribute_after: new Date().toISOString(),
    })
    .eq("organization_id", organization_id)
    .select("organization_id,quota_delivered,quota_total,is_active,distribute_after")
    .single();
  if (updError) throw new Error(updError.message);
  console.log("Updated free delivery:", updated);
}

const { data: mdh } = await sb
  .from("organizations")
  .select("id,name")
  .ilike("name", "%debt%hero%")
  .maybeSingle();
if (mdh) {
  const { data: camp } = await sb
    .from("organization_free_delivery")
    .select("quota_delivered,quota_total,is_active")
    .eq("organization_id", mdh.id)
    .maybeSingle();
  console.log("My Debt Hero final:", camp);
}

console.log("Done.");
