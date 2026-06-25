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

const env = loadEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const cronSecret = env.CRON_SECRET;
const base44Key = env.BASE44_API_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key);

async function main() {
  const report = { generated_at: new Date().toISOString() };

  const { data: cursor, error: cursorError } = await sb
    .from("external_sync_cursors")
    .select("*")
    .eq("provider", "base44")
    .maybeSingle();
  report.sync_cursor = cursorError ? { error: cursorError.message } : cursor;

  const [{ count: base44Count }, { count: manualCount }, { count: totalCount }] =
    await Promise.all([
      sb.from("leads").select("*", { count: "exact", head: true }).eq("source_system", "base44"),
      sb.from("leads").select("*", { count: "exact", head: true }).eq("source_system", "manual"),
      sb.from("leads").select("*", { count: "exact", head: true }),
    ]);
  report.lead_counts = { base44: base44Count, manual: manualCount, total: totalCount };

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [{ count: base4424h }, { count: base447d }] = await Promise.all([
    sb
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("source_system", "base44")
      .gte("created_at", since24h),
    sb
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("source_system", "base44")
      .gte("created_at", since7d),
  ]);
  report.base44_ingested = { last_24h: base4424h, last_7d: base447d };

  const { data: latest, error: latestError } = await sb
    .from("leads")
    .select(
      "id,first_name,last_name,phone,created_at,source_created_at,source_updated_at,source_external_id"
    )
    .eq("source_system", "base44")
    .order("created_at", { ascending: false })
    .limit(10);
  report.latest_base44_leads = latestError ? { error: latestError.message } : latest;

  const { data: cronJobs, error: cronError } = await sb.rpc("audit_http_cron_jobs").maybeSingle?.();
  void cronJobs;
  void cronError;

  // pg_cron / pg_net require SQL — attempt via REST won't work; note for user.
  report.cron_sql_note =
    "Run the SQL audit queries in Supabase SQL Editor (see audit output docs).";

  if (base44Key) {
    const baseUrl = (
      env.BASE44_BASE_URL || "https://choisir-assur-pro.base44.app/api"
    ).replace(/\/+$/, "");
    const listUrl = new URL(`${baseUrl}/entities/SaLead`);
    listUrl.searchParams.set("limit", "5");
    listUrl.searchParams.set("skip", "0");
    listUrl.searchParams.set("sort_by", "-created_date");
    listUrl.searchParams.set("q", JSON.stringify({ last_step: "completed" }));
    try {
      const res = await fetch(listUrl, {
        headers: { api_key: base44Key, Accept: "application/json" },
        cache: "no-store",
      });
      const text = await res.text();
      report.base44_api_probe = {
        status: res.status,
        ok: res.ok,
        sample_count: res.ok && Array.isArray(JSON.parse(text)) ? JSON.parse(text).length : 0,
        newest_ids:
          res.ok && Array.isArray(JSON.parse(text))
            ? JSON.parse(text).slice(0, 3).map((r) => ({
                id: r?.id,
                created_date: r?.created_date,
                prenom: r?.prenom,
                nom: r?.nom,
              }))
            : text.slice(0, 200),
      };
    } catch (e) {
      report.base44_api_probe = { error: e instanceof Error ? e.message : String(e) };
    }
  } else {
    report.base44_api_probe = { error: "BASE44_API_KEY not set locally" };
  }

  if (cronSecret) {
    const appUrl = env.NEXT_PUBLIC_APP_URL || env.VERCEL_URL;
    if (appUrl) {
      const syncUrl = `${appUrl.replace(/\/+$/, "")}/api/cron/base44-sync`;
      try {
        const res = await fetch(syncUrl, {
          method: "POST",
          headers: { "x-cron-secret": cronSecret },
          cache: "no-store",
        });
        const body = await res.json().catch(() => ({}));
        report.manual_sync_trigger = { url: syncUrl, status: res.status, body };
      } catch (e) {
        report.manual_sync_trigger = {
          url: syncUrl,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    } else {
      report.manual_sync_trigger = {
        skipped: "Set NEXT_PUBLIC_APP_URL or VERCEL_URL to test live cron endpoint",
      };
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
