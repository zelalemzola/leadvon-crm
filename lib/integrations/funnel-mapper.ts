import { z } from "zod";
import type { FunnelFormSubmission } from "@/lib/integrations/funnel";

export type MappedFunnelLead = {
  category_id: string;
  lead_unit_type: "single" | "family";
  phone: string;
  zip_code?: string | null;
  first_name: string;
  last_name: string;
  country: string;
  summary: string;
  source_system: "funnel";
  source_external_id: string;
  source_payload: Record<string, unknown>;
  source_created_at: string | null;
  source_updated_at: string | null;
};

const PHONE_KEYS = [
  "phone",
  "phone_number",
  "telephone",
  "mobile",
  "mobile_number",
  "whatsapp",
  "whatsapp_number",
  "tel",
];

const FIRST_NAME_KEYS = ["first_name", "firstname", "prenom", "firstName"];
const LAST_NAME_KEYS = ["last_name", "lastname", "nom", "surname", "lastName"];
const FULL_NAME_KEYS = ["full_name", "fullname", "name", "contact_name"];
const ZIP_KEYS = ["zip", "postal_code", "postcode", "zip_code"];
const COUNTRY_KEYS = ["country", "country_name", "nation"];

const submissionSchema = z.object({
  id: z.coerce.string().trim().min(1),
  created_at: z.coerce.string().trim().min(1),
  updated_at: z.coerce.string().trim().nullish(),
  answers: z.record(z.string(), z.unknown()).nullish(),
  geo: z.record(z.string(), z.unknown()).nullish(),
});

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeSpace(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function readStringValue(source: Record<string, unknown>, key: string) {
  const direct = source[key];
  if (typeof direct === "string") return normalizeSpace(direct);
  return "";
}

function firstValue(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = readStringValue(source, key);
    if (value) return value;
  }
  return "";
}

function normalizedPhone(raw: string) {
  return raw.replace(/[^\d+]/g, "");
}

function extractName(answers: Record<string, unknown>) {
  const first = firstValue(answers, FIRST_NAME_KEYS);
  const last = firstValue(answers, LAST_NAME_KEYS);
  if (first && last) return { first, last };

  const full = firstValue(answers, FULL_NAME_KEYS);
  if (full) {
    const parts = full.split(" ").filter(Boolean);
    if (parts.length >= 2) {
      return {
        first: parts[0]!,
        last: parts.slice(1).join(" "),
      };
    }
    if (parts.length === 1) {
      return { first: parts[0]!, last: "Unknown" };
    }
  }
  return { first, last };
}

function parseLeadQaSummary(answers: Record<string, unknown>) {
  const raw = answers.lead_qa;
  const json =
    typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw) as unknown;
          } catch {
            return null;
          }
        })()
      : raw;
  if (!Array.isArray(json)) return "";

  const parts: string[] = [];
  for (const row of json) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const question =
      (typeof r.question === "string" ? normalizeSpace(r.question) : "") ||
      (typeof r.key === "string" ? normalizeSpace(r.key) : "");
    const answer = typeof r.answer === "string" ? normalizeSpace(r.answer) : "";
    if (!question || !answer) continue;
    parts.push(`${question}: ${answer}`);
    if (parts.length >= 8) break;
  }
  return parts.join(" - ").slice(0, 2000);
}

function fallbackSummary(answers: Record<string, unknown>) {
  const ignore = new Set([
    "first_name",
    "firstname",
    "prenom",
    "firstName",
    "last_name",
    "lastname",
    "nom",
    "surname",
    "lastName",
    "full_name",
    "fullname",
    "name",
    "contact_name",
    "phone",
    "phone_number",
    "telephone",
    "mobile",
    "mobile_number",
    "whatsapp",
    "whatsapp_number",
    "tel",
    "_source",
    "_submit_page_id",
    "client_session_id",
    "ab_variant_id",
    "lead_qa",
  ]);

  const parts: string[] = [];
  for (const [key, value] of Object.entries(answers)) {
    if (ignore.has(key)) continue;
    const v =
      typeof value === "string"
        ? normalizeSpace(value)
        : value == null
          ? ""
          : JSON.stringify(value);
    if (!v) continue;
    parts.push(`${key}: ${v}`);
    if (parts.length >= 8) break;
  }
  return parts.join(" - ").slice(0, 2000);
}

export function mapFunnelSubmissionToInventoryLead(
  raw: FunnelFormSubmission,
  categoryId: string
): { ok: true; data: MappedFunnelLead } | { ok: false; reason: string } {
  const parsed = submissionSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  const input = parsed.data;
  const answers = asRecord(input.answers);
  const geo = asRecord(input.geo);

  const phoneRaw = firstValue(answers, PHONE_KEYS);
  const phone = normalizedPhone(phoneRaw);
  if (!phone || phone.length < 7) {
    return { ok: false, reason: "missing_or_invalid_phone" };
  }

  const name = extractName(answers);
  if (!name.first) {
    return { ok: false, reason: "missing_first_name" };
  }

  const country =
    firstValue(answers, COUNTRY_KEYS) ||
    firstValue(geo, ["country"]) ||
    "Unknown";
  const zipCode =
    firstValue(answers, ZIP_KEYS) ||
    firstValue(geo, ["postalCode", "zip", "postal_code"]) ||
    null;
  const summary = parseLeadQaSummary(answers) || fallbackSummary(answers);

  return {
    ok: true,
    data: {
      category_id: categoryId,
      lead_unit_type: "single",
      phone,
      zip_code: zipCode,
      first_name: name.first.slice(0, 120),
      last_name: (name.last || "Unknown").slice(0, 120),
      country: country.slice(0, 120),
      summary,
      source_system: "funnel",
      source_external_id: input.id,
      source_payload: raw as Record<string, unknown>,
      source_created_at: input.created_at ?? null,
      source_updated_at: input.updated_at ?? input.created_at ?? null,
    },
  };
}
