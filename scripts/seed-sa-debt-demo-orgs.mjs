/**
 * Seed 3 South African debt-insurance demo organizations with exclusive lead
 * delivery, high conversion statuses, agents, billing history, SMS, scripts,
 * and activity — for marketing walkthroughs.
 *
 * Usage: node scripts/seed-sa-debt-demo-orgs.mjs
 *
 * Safe to re-run: replaces prior seed data for these orgs, then recreates.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

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

const PRICE_CENTS = 2200;
/** Internal inventory id prefix only — never shown in UI summaries. */
const SOURCE_ID_PREFIX = "sa-debt";

const ORGS = [
  {
    key: "protea",
    organization_name: "Protea Debt Cover (Pty) Ltd",
    phone: "+27214871200",
    admin: {
      email: "lindiwe.mokoena@proteadebtcover.co.za",
      previousEmails: ["demo.protea@leadvon-demo.co.za"],
      password: "ProteaCover#2026",
      full_name: "Lindiwe Mokoena",
    },
    agents: [
      {
        email: "thabo.dlamini@proteadebtcover.co.za",
        password: "AgentAccess#2026",
        full_name: "Thabo Dlamini",
        pct: 40,
      },
      {
        email: "zanele.nkosi@proteadebtcover.co.za",
        password: "AgentAccess#2026",
        full_name: "Zanele Nkosi",
        pct: 35,
      },
      {
        email: "pieter.botha@proteadebtcover.co.za",
        password: "AgentAccess#2026",
        full_name: "Pieter Botha",
        pct: 25,
      },
    ],
    leadCount: 47,
  },
  {
    key: "naledi",
    organization_name: "Naledi Shield Debt Insurance",
    phone: "+27115663480",
    admin: {
      email: "kagiso.molefe@naledishield.co.za",
      previousEmails: ["demo.naledi@leadvon-demo.co.za"],
      password: "NalediShield#2026",
      full_name: "Kagiso Molefe",
    },
    agents: [
      {
        email: "ayanda.sithole@naledishield.co.za",
        password: "AgentAccess#2026",
        full_name: "Ayanda Sithole",
        pct: 45,
      },
      {
        email: "fatima.naidoo@naledishield.co.za",
        password: "AgentAccess#2026",
        full_name: "Fatima Naidoo",
        pct: 30,
      },
      {
        email: "johan.vandermerwe@naledishield.co.za",
        password: "AgentAccess#2026",
        full_name: "Johan van der Merwe",
        pct: 25,
      },
    ],
    leadCount: 87,
  },
  {
    key: "cape",
    organization_name: "CapeSure Debt Protection SA",
    phone: "+27214658900",
    admin: {
      email: "nomsa.khumalo@capesure.co.za",
      previousEmails: ["demo.capesure@leadvon-demo.co.za"],
      password: "CapeSureProtect#2026",
      full_name: "Nomsa Khumalo",
    },
    agents: [
      {
        email: "sipho.mabaso@capesure.co.za",
        password: "AgentAccess#2026",
        full_name: "Sipho Mabaso",
        pct: 35,
      },
      {
        email: "lerato.dube@capesure.co.za",
        password: "AgentAccess#2026",
        full_name: "Lerato Dube",
        pct: 35,
      },
      {
        email: "priya.pillay@capesure.co.za",
        password: "AgentAccess#2026",
        full_name: "Priya Pillay",
        pct: 30,
      },
    ],
    leadCount: 145,
  },
];

const FIRST_NAMES = [
  "Thabo",
  "Sipho",
  "Nomsa",
  "Lerato",
  "Kagiso",
  "Ayanda",
  "Zanele",
  "Mandla",
  "Precious",
  "Themba",
  "Naledi",
  "Bongani",
  "Fatima",
  "Yusuf",
  "Pieter",
  "Annelie",
  "Johan",
  "Chandre",
  "Priya",
  "Riaan",
  "Sibusiso",
  "Thandi",
  "Mpho",
  "Karabo",
  "Refiloe",
  "Andile",
  "Ntombi",
  "Jacques",
  "Carmen",
  "Dineo",
  "Tshepo",
  "Busisiwe",
  "Lwandile",
  "Amogelang",
  "Shaun",
  "Nicole",
  "Vusi",
  "Palesa",
  "Hendrik",
  "Zinhle",
];

const LAST_NAMES = [
  "Dlamini",
  "Nkosi",
  "Botha",
  "van der Merwe",
  "Naidoo",
  "Mokoena",
  "Sithole",
  "Mabaso",
  "Pillay",
  "Govender",
  "Jacobs",
  "Williams",
  "Molefe",
  "Khumalo",
  "Ndlovu",
  "Zwane",
  "Coetzee",
  "Du Plessis",
  "Abrahams",
  "Mthembu",
  "Radebe",
  "Baloyi",
  "Fourie",
  "Nel",
  "Singh",
  "Moodley",
  "Zulu",
  "Mabena",
  "Hassan",
  "Olivier",
];

const PROVINCES = [
  "Gauteng",
  "Western Cape",
  "KwaZulu-Natal",
  "Eastern Cape",
  "Free State",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
];

const WORK = [
  "full_time",
  "part_time",
  "self_employed",
  "pension",
  "retired",
];
const WORK_LABELS = {
  full_time: "Full time",
  part_time: "Part time",
  self_employed: "Self employed",
  pension: "Pension",
  retired: "Retired",
};
const INCOME = [
  "5000_10000",
  "10000_30000",
  "30000_50000",
  "over_50000",
];
const INCOME_LABELS = {
  "5000_10000": "R5,000 – R10,000",
  "10000_30000": "R10,000 – R30,000",
  "30000_50000": "R30,000 – R50,000",
  over_50000: "Over R50,000",
};
const DEBT = [
  "50000_100000",
  "100000_200000",
  "200000_500000",
  "over_500000",
];
const DEBT_LABELS = {
  "50000_100000": "R50,000 – R100,000",
  "100000_200000": "R100,000 – R200,000",
  "200000_500000": "R200,000 – R500,000",
  over_500000: "Over R500,000",
};

/** Status mix → ~62% conversion on contacted leads (>55%). */
const STATUS_WEIGHTS = [
  ["new", 3],
  ["no_answer", 8],
  ["call_back", 9],
  ["qualified", 38],
  ["closed", 24],
  ["not_interested", 8],
  ["unqualified", 6],
  ["duplicate", 4],
];

const env = loadEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function pick(arr, i) {
  return arr[i % arr.length];
}

function buildStatusList(n) {
  const totalW = STATUS_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  const list = [];
  for (const [status, w] of STATUS_WEIGHTS) {
    const count = Math.round((w / totalW) * n);
    for (let i = 0; i < count; i++) list.push(status);
  }
  while (list.length < n) list.push("qualified");
  while (list.length > n) list.pop();
  // Shuffle deterministically
  for (let i = list.length - 1; i > 0; i--) {
    const j = (i * 17 + 3) % (i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Believable SA mobile: +27 + network (82/83/84/71–79) + 7 mixed digits (no zero runs). */
function saPhone(orgIndex, leadIndex) {
  const prefix = ["82", "83", "84", "71", "72", "73", "74", "76", "78", "79"][
    (orgIndex * 3 + leadIndex * 7) % 10
  ];
  // Mix digits so numbers look like real handsets, not sequential padded zeros
  let n =
    ((orgIndex + 1) * 4_173_829 + (leadIndex + 1) * 791_9 + 2_584_713) %
    9_000_000;
  n += 1_000_000; // keep 7 digits, always starts 1–9
  let rest = String(n);
  // Avoid long zero / repeated runs that look fake
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

function daysAgo(n, hour = 10) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(hour, (n * 7) % 60, (n * 13) % 60, 0);
  return d.toISOString();
}

function buildSummary(i) {
  const age = 24 + (i % 40);
  const province = pick(PROVINCES, i);
  const work = pick(WORK, i);
  const income = pick(INCOME, i + 1);
  const debt = pick(DEBT, i + 2);
  return [
    `age: ${age}`,
    `province: ${province}`,
    `work: ${WORK_LABELS[work]}`,
    `income: ${INCOME_LABELS[income]}`,
    `debt: ${DEBT_LABELS[debt]}`,
    "Debt Review Status: Not under Debt review",
    "Currency: ZAR (South African Rand)",
  ].join(" - ");
}

async function ensureCategory() {
  const { data: existing } = await sb
    .from("categories")
    .select("id, slug, name")
    .in("slug", ["debt-review", "debt-relief"])
    .limit(5);

  let cat = (existing ?? []).find((c) => c.slug === "debt-review");
  if (!cat) cat = (existing ?? [])[0];
  if (!cat) {
    const { data, error } = await sb
      .from("categories")
      .insert({ name: "Debt Review", slug: "debt-review" })
      .select("id, slug, name")
      .single();
    if (error) throw new Error(`Create category: ${error.message}`);
    cat = data;
  }
  return cat;
}

async function listAllAuthUsers() {
  const users = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const batch = data?.users ?? [];
    users.push(...batch);
    if (batch.length < 200) break;
  }
  return users;
}

async function findOrCreateUser({
  email,
  previousEmails = [],
  password,
  full_name,
  role,
  organization_id,
  phone,
  pct,
}) {
  const listed = await listAllAuthUsers();
  const emailSet = new Set(
    [email, ...previousEmails].map((e) => e.toLowerCase())
  );
  let user = listed.find((u) => u.email && emailSet.has(u.email.toLowerCase()));

  if (!user) {
    const { data, error } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role },
      user_metadata: { full_name },
    });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);
    user = data.user;
  } else {
    const { error } = await sb.auth.admin.updateUserById(user.id, {
      email,
      password,
      email_confirm: true,
      app_metadata: { role },
      user_metadata: { full_name },
    });
    if (error) throw new Error(`updateUser ${email}: ${error.message}`);
  }

  const profilePatch = {
    role,
    is_active: true,
    email,
    full_name,
    organization_id,
    phone: phone ?? null,
  };
  if (pct != null) profilePatch.lead_assignment_percentage = pct;

  const { error: profileError } = await sb.from("profiles").update(profilePatch).eq("id", user.id);
  if (profileError) throw new Error(`profile ${email}: ${profileError.message}`);

  return user;
}

async function cleanupOrgSeed(orgId, orgKey) {
  const { data: byExt } = await sb
    .from("leads")
    .select("id")
    .or(
      `source_external_id.like.${SOURCE_ID_PREFIX}-${orgKey}-%,source_external_id.like.demo-sa-${orgKey}-%`
    );

  const sourceFromExt = (byExt ?? []).map((r) => r.id);

  const { data: seeded } = await sb
    .from("customer_leads")
    .select("id, source_lead_id, summary")
    .eq("organization_id", orgId);

  const tagged = (seeded ?? []).filter(
    (r) =>
      String(r.summary ?? "").includes("[DEMO-SA-DEBT]") ||
      sourceFromExt.includes(r.source_lead_id)
  );

  // These showcase orgs are seed-only — clear all prior customer leads for a clean rebuild
  const rows = seeded ?? [];
  if (rows.length === 0 && sourceFromExt.length === 0) return;

  const clIds = rows.map((r) => r.id);
  const sourceIds = [
    ...new Set([
      ...rows.map((r) => r.source_lead_id).filter(Boolean),
      ...sourceFromExt,
    ]),
  ];

  if (clIds.length) {
    await sb
      .from("customer_notifications")
      .delete()
      .eq("entity_type", "customer_lead")
      .in("entity_id", clIds);

    await sb.from("sms_messages").delete().in("customer_lead_id", clIds);
    await sb.from("delivery_ledger_lines").delete().in("customer_lead_id", clIds);
    await sb.from("customer_leads").delete().in("id", clIds);
  }

  if (sourceIds.length) {
    await sb.from("leads").delete().in("id", sourceIds);
  }
  console.log(`  cleaned ${rows.length} prior leads${tagged.length ? ` (${tagged.length} tagged)` : ""}`);
}

async function seedOrg(orgDef, category, orgIndex) {
  console.log(`\n=== ${orgDef.organization_name} (${orgDef.leadCount} leads) ===`);

  // Organization
  let orgId;
  const { data: byName } = await sb
    .from("organizations")
    .select("id, name")
    .eq("name", orgDef.organization_name)
    .maybeSingle();

  if (byName) {
    orgId = byName.id;
    await sb
      .from("organizations")
      .update({ phone: orgDef.phone })
      .eq("id", orgId);
    console.log(`  org exists: ${orgId}`);
  } else {
    const { data: org, error } = await sb
      .from("organizations")
      .insert({ name: orgDef.organization_name, phone: orgDef.phone })
      .select("id")
      .single();
    if (error) throw new Error(`org insert: ${error.message}`);
    orgId = org.id;
    console.log(`  org created: ${orgId}`);
  }

  await cleanupOrgSeed(orgId, orgDef.key);

  const admin = await findOrCreateUser({
    ...orgDef.admin,
    role: "customer_admin",
    organization_id: orgId,
    phone: orgDef.phone,
    pct: 0,
  });
  console.log(`  admin: ${orgDef.admin.email}`);

  const agents = [];
  for (const a of orgDef.agents) {
    const u = await findOrCreateUser({
      ...a,
      role: "customer_agent",
      organization_id: orgId,
      pct: a.pct,
    });
    agents.push({ ...a, id: u.id });
    console.log(`  agent: ${a.email} (${a.pct}%)`);
  }

  const assigneePool = agents.map((a) => a.id);
  const statuses = buildStatusList(orgDef.leadCount);

  // Prepaid entitlement (depleted so cron won't steal live inventory later)
  const periodStart = daysAgo(28, 8);
  const periodEnd = daysAgo(-20, 8); // still valid window for display
  const budgetTotal = orgDef.leadCount * PRICE_CENTS + 5000;
  const budgetRemaining = 0;

  // Remove old entitlements for this org (by stripe ref)
  const stripeRef = `sa_debt_cover_${orgDef.key}`;
  const oldStripeRefs = [`demo_sa_debt_${orgDef.key}`, stripeRef];
  await sb
    .from("delivery_ledger_lines")
    .delete()
    .eq("organization_id", orgId)
    .ilike("description", "%Debt Review lead delivery%");
  await sb.from("delivery_entitlements").delete().in("stripe_payment_ref", oldStripeRefs);

  const { data: entitlement, error: entErr } = await sb
    .from("delivery_entitlements")
    .insert({
      organization_id: orgId,
      budget_cents_total: budgetTotal,
      budget_cents_remaining: budgetRemaining,
      currency: "USD",
      period_start: periodStart,
      period_end: periodEnd,
      source: "prepaid_purchase",
      stripe_payment_ref: stripeRef,
      status: "depleted",
    })
    .select("id")
    .single();
  if (entErr) throw new Error(`entitlement: ${entErr.message}`);

  // Lead flow: active for UI, but obligation already met + no pending + depleted budget
  await sb
    .from("customer_lead_flows")
    .delete()
    .eq("organization_id", orgId)
    .eq("category_id", category.id);

  const { data: flow, error: flowErr } = await sb
    .from("customer_lead_flows")
    .insert({
      organization_id: orgId,
      category_id: category.id,
      unit_type: "single",
      leads_per_week: Math.max(5, Math.round(orgDef.leadCount / 4)),
      is_active: true,
      pending_delivery_leads: 0,
      last_obligation_date: new Date().toISOString().slice(0, 10),
      accrued_this_month: orgDef.leadCount,
      delivered_this_month: orgDef.leadCount,
      last_run_at: daysAgo(1, 9),
      created_by: admin.id,
    })
    .select("id")
    .single();
  if (flowErr) throw new Error(`lead flow: ${flowErr.message}`);

  await sb.from("customer_flow_commitments").upsert(
    {
      flow_id: flow.id,
      monthly_target_leads: orgDef.leadCount,
      business_days_only: true,
      shortfall_policy: "rollover",
      is_active: true,
    },
    { onConflict: "flow_id" }
  );

  // Create + deliver leads exclusively (sold immediately — never enter unsold pool)
  const customerLeadIds = [];
  let balanceAfter = budgetTotal;

  for (let i = 0; i < orgDef.leadCount; i++) {
    const first = pick(FIRST_NAMES, orgIndex * 50 + i);
    const last = pick(LAST_NAMES, orgIndex * 37 + i * 3);
    const province = pick(PROVINCES, i + orgIndex);
    const phone = saPhone(orgIndex, i);
    const summary = buildSummary(i + orgIndex * 100);
    // Keep every lead inside the dashboard's default "Last 30 days" window
    const ageDays = Math.min(27, Math.floor((i / Math.max(1, orgDef.leadCount - 1)) * 27));
    const createdAt = daysAgo(ageDays, 8 + (i % 10));
    const status = statuses[i];
    const assignee = assigneePool[i % assigneePool.length];
    const contacted = status !== "new";
    const contactDelayMs = (20 + (i % 180)) * 60_000; // 20min–3h
    const firstContacted = contacted
      ? new Date(new Date(createdAt).getTime() + contactDelayMs).toISOString()
      : null;
    const callCount = contacted ? 1 + (i % 5) : 0;
    const leadId = randomUUID();
    const clId = randomUUID();

    const { error: invErr } = await sb.from("leads").insert({
      id: leadId,
      category_id: category.id,
      phone,
      first_name: first,
      last_name: last,
      country: "South Africa",
      zip_code: province,
      summary,
      lead_unit_type: "single",
      review_status: "no",
      source_system: "manual",
      source_external_id: `${SOURCE_ID_PREFIX}-${orgDef.key}-${i + 1}`,
      sold_at: createdAt,
      created_at: createdAt,
      updated_at: createdAt,
    });
    if (invErr) throw new Error(`inventory lead ${i}: ${invErr.message}`);

    const { error: clErr } = await sb.from("customer_leads").insert({
      id: clId,
      organization_id: orgId,
      source_lead_id: leadId,
      category_id: category.id,
      phone,
      first_name: first,
      last_name: last,
      country: "South Africa",
      zip_code: province,
      summary,
      notes:
        status === "closed" || status === "qualified"
          ? "Client enrolled / qualified after debt review consultation."
          : status === "call_back"
            ? "Requested callback after payday."
            : "",
      lead_unit_type: "single",
      status,
      assigned_to: assignee,
      grant_source: "paid",
      charged_amount_cents: PRICE_CENTS,
      entitlement_id: entitlement.id,
      purchase_id: null,
      call_count: callCount,
      first_contacted_at: firstContacted,
      status_updated_at: firstContacted ?? createdAt,
      created_at: createdAt,
      updated_at: firstContacted ?? createdAt,
    });
    if (clErr) throw new Error(`customer lead ${i}: ${clErr.message}`);

    balanceAfter -= PRICE_CENTS;
    customerLeadIds.push({
      id: clId,
      phone,
      first,
      last,
      status,
      createdAt,
      assignee,
    });

    if ((i + 1) % 25 === 0 || i === orgDef.leadCount - 1) {
      process.stdout.write(`  leads ${i + 1}/${orgDef.leadCount}\r`);
    }
  }
  console.log(`  delivered ${orgDef.leadCount} leads exclusively`);

  // Ledger lines (batch)
  const ledgerRows = customerLeadIds.map((cl, i) => ({
    entitlement_id: entitlement.id,
    organization_id: orgId,
    amount_cents: PRICE_CENTS,
    balance_after_cents: Math.max(0, budgetTotal - (i + 1) * PRICE_CENTS),
    unit_type: "single",
    category_id: category.id,
    customer_lead_id: cl.id,
    description: "Debt Review lead delivery",
    created_at: cl.createdAt,
  }));
  for (let i = 0; i < ledgerRows.length; i += 50) {
    const chunk = ledgerRows.slice(i, i + 50);
    const { error } = await sb.from("delivery_ledger_lines").insert(chunk);
    if (error) throw new Error(`ledger: ${error.message}`);
  }

  // Call scripts
  await sb.from("customer_call_scripts").delete().eq("organization_id", orgId);
  await sb.from("customer_call_scripts").insert([
    {
      organization_id: orgId,
      title: "Debt Review — First Contact (ZA)",
      content:
        "Sawubona / Hello, am I speaking with {first_name}? This is {agent} from " +
        orgDef.organization_name +
        ". You recently enquired about debt review / debt relief options. " +
        "Are you currently under debt review with an NCR-registered counsellor? " +
        "I'd like to understand your monthly income and total unsecured debt so we can see if debt cover is a fit.",
      created_by: admin.id,
    },
    {
      organization_id: orgId,
      title: "Callback — Pay-day Follow-up",
      content:
        "Hi {first_name}, following up as agreed after payday. Have you had a chance to look at the quote we sent? " +
        "We can still help structure cover around your existing repayments without putting you under debt review if that is not required.",
      created_by: admin.id,
    },
    {
      organization_id: orgId,
      title: "Qualified — Closing Script",
      content:
        "Great news {first_name}. Based on your income and debt profile we can proceed with an application. " +
        "I'll email the disclosure and policy summary. Once you confirm, we lock in cover and a claims assist line for creditors.",
      created_by: admin.id,
    },
  ]);

  // SMS balance, automation, sample messages
  const { data: smsBal } = await sb
    .from("sms_balances")
    .select("id, balance_cents")
    .eq("organization_id", orgId)
    .maybeSingle();

  let smsBalanceId = smsBal?.id;
  if (!smsBalanceId) {
    const { data: created } = await sb
      .from("sms_balances")
      .insert({ organization_id: orgId, balance_cents: 15000 })
      .select("id")
      .single();
    smsBalanceId = created.id;
  } else {
    await sb.from("sms_balances").update({ balance_cents: 15000 }).eq("id", smsBalanceId);
  }

  await sb.from("sms_automations").delete().eq("organization_id", orgId);
  const { data: auto } = await sb
    .from("sms_automations")
    .insert({
      organization_id: orgId,
      name: "New lead welcome (ZA)",
      trigger_status: "new",
      message_template:
        "Hi {{first_name}}, thanks for your debt relief enquiry with " +
        orgDef.organization_name +
        ". An adviser will call you shortly. Reply STOP to opt out.",
      is_active: true,
      created_by: admin.id,
    })
    .select("id")
    .single();

  await sb.from("sms_messages").delete().eq("organization_id", orgId);
  const smsSample = customerLeadIds.filter((c) => c.status !== "new").slice(0, 18);
  if (smsSample.length && smsBalanceId) {
    await sb.from("sms_messages").insert(
      smsSample.map((cl, i) => ({
        organization_id: orgId,
        customer_lead_id: cl.id,
        automation_id: i % 3 === 0 ? auto?.id ?? null : null,
        actor_id: cl.assignee,
        to_phone: cl.phone,
        body: `Hi ${cl.first}, ${orgDef.organization_name} here — following up on your debt cover enquiry. Call us on ${orgDef.phone}.`,
        cost_cents: 30,
        delivery_status: "delivered",
        created_at: daysAgo(1 + (i % 20), 14),
      }))
    );
  }

  // Audit activity
  await sb.from("customer_audit_logs").delete().eq("organization_id", orgId);
  const auditRows = [];
  auditRows.push({
    organization_id: orgId,
    actor_id: admin.id,
    action: "billing.prepaid_activated",
    entity_type: "delivery_entitlement",
    entity_id: entitlement.id,
    details: { leads_purchased: orgDef.leadCount, category: "Debt Review" },
    created_at: daysAgo(27, 9),
  });
  for (const a of agents) {
    auditRows.push({
      organization_id: orgId,
      actor_id: admin.id,
      action: "user.create",
      entity_type: "profile",
      entity_id: a.id,
      details: { email: a.email, role: "customer_agent" },
      created_at: daysAgo(26, 11),
    });
  }
  for (const cl of customerLeadIds.slice(0, Math.min(40, customerLeadIds.length))) {
    if (cl.status === "new") continue;
    auditRows.push({
      organization_id: orgId,
      actor_id: cl.assignee,
      action: "lead.status_update",
      entity_type: "customer_lead",
      entity_id: cl.id,
      details: {
        status: cl.status,
        lead: `${cl.first} ${cl.last}`,
      },
      created_at: daysAgo(
        Math.max(0, Math.floor((Date.now() - new Date(cl.createdAt).getTime()) / 86400000)),
        15
      ),
    });
  }
  for (let i = 0; i < auditRows.length; i += 50) {
    const { error } = await sb.from("customer_audit_logs").insert(auditRows.slice(i, i + 50));
    if (error) throw new Error(`audit: ${error.message}`);
  }

  // Wallet top-up for legacy billing views
  await sb
    .from("wallets")
    .update({ balance_cents: 25000 })
    .eq("organization_id", orgId);

  // Conversion check
  const contacted = customerLeadIds.filter((c) => c.status !== "new").length;
  const won = customerLeadIds.filter((c) => c.status === "qualified" || c.status === "closed").length;
  const rate = contacted ? ((won / contacted) * 100).toFixed(1) : "0";
  console.log(`  conversion: ${won}/${contacted} contacted = ${rate}%`);

  return {
    organization_id: orgId,
    organization_name: orgDef.organization_name,
    admin_email: orgDef.admin.email,
    admin_password: orgDef.admin.password,
    agents: orgDef.agents.map((a) => ({
      email: a.email,
      password: a.password,
      name: a.full_name,
    })),
    leads: orgDef.leadCount,
    conversion_rate: Number(rate),
  };
}

async function main() {
  console.log("Seeding SA debt-insurance demo organizations…");
  const category = await ensureCategory();
  console.log(`Category: ${category.name} (${category.slug})`);

  const results = [];
  for (let i = 0; i < ORGS.length; i++) {
    results.push(await seedOrg(ORGS[i], category, i));
  }

  console.log("\n========== DEMO CREDENTIALS ==========");
  for (const r of results) {
    console.log(`\n${r.organization_name}`);
    console.log(`  Admin login: ${r.admin_email}`);
    console.log(`  Password:    ${r.admin_password}`);
    console.log(`  Leads:       ${r.leads}  |  Conversion: ${r.conversion_rate}%`);
    console.log("  Agents:");
    for (const a of r.agents) {
      console.log(`    ${a.name} — ${a.email} / ${a.password}`);
    }
  }
  console.log("\nDone. Login at /client with the admin emails above.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
