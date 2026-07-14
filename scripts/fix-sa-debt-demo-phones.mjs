/**
 * Replace zero-heavy phone numbers on the 3 SA debt showcase orgs
 * with believable +27 mobiles. Also syncs inventory leads + SMS to_phone.
 *
 * Usage: node scripts/fix-sa-debt-demo-phones.mjs
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

/** Believable SA mobile: +27 + network + 7 mixed digits (no zero runs). */
function saPhone(orgIndex, leadIndex) {
  const prefix = ["82", "83", "84", "71", "72", "73", "74", "76", "78", "79"][
    (orgIndex * 3 + leadIndex * 7) % 10
  ];
  let n =
    ((orgIndex + 1) * 4_173_829 + (leadIndex + 1) * 791_9 + 2_584_713) %
    9_000_000;
  n += 1_000_000;
  let rest = String(n);
  rest = rest
    .replace(/0{2,}/g, (m) =>
      m
        .split("")
        .map((_, i) => String(((n + i + 3) % 9) + 1))
        .join("")
    )
    .replace(/(\d)\1{3,}/g, (m, d) => {
      const alt = String((Number(d) + 3) % 10);
      return d + alt + d + ((Number(alt) + 2) % 10);
    })
    .slice(0, 7)
    .padEnd(7, "3");
  return `+27${prefix}${rest}`;
}

const ORGS = [
  {
    id: "2fad78b9-b649-4e7e-b6f2-1e02952aa57b",
    index: 0,
    name: "Protea Debt Cover (Pty) Ltd",
  },
  {
    id: "a2fd4880-7e14-4ff2-b062-16cf19d26625",
    index: 1,
    name: "Naledi Shield Debt Insurance",
  },
  {
    id: "e6372be5-f501-4ae6-9b13-f284e7257900",
    index: 2,
    name: "CapeSure Debt Protection SA",
  },
];

const env = loadEnvLocal();
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  for (const org of ORGS) {
    const { data: leads, error } = await sb
      .from("customer_leads")
      .select("id, source_lead_id")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const rows = leads ?? [];
    const used = new Set();
    const phoneByLead = new Map();

    for (let i = 0; i < rows.length; i++) {
      let phone = saPhone(org.index, i);
      let guard = 0;
      while (used.has(phone) && guard < 50) {
        phone = saPhone(org.index, i + 1000 + guard);
        guard += 1;
      }
      used.add(phone);
      phoneByLead.set(rows[i].id, phone);

      const { error: e1 } = await sb
        .from("customer_leads")
        .update({ phone })
        .eq("id", rows[i].id);
      if (e1) throw new Error(`customer_leads: ${e1.message}`);

      if (rows[i].source_lead_id) {
        const { error: e2 } = await sb
          .from("leads")
          .update({ phone })
          .eq("id", rows[i].source_lead_id);
        if (e2) throw new Error(`leads: ${e2.message}`);
      }
    }

    const { data: sms } = await sb
      .from("sms_messages")
      .select("id, customer_lead_id")
      .eq("organization_id", org.id);

    for (const msg of sms ?? []) {
      const phone = phoneByLead.get(msg.customer_lead_id);
      if (!phone) continue;
      await sb.from("sms_messages").update({ to_phone: phone }).eq("id", msg.id);
    }

    const samples = [...used].slice(0, 5).join(", ");
    console.log(`${org.name}: updated ${rows.length} phones → ${samples}`);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
