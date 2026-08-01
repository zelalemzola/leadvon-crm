import { z } from "zod";
import type { Base44WmLead } from "@/lib/integrations/wmleads";

const REQUIRED_STATUS = "new";

const optionalTrimmedString = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => (v === null || v === undefined ? "" : String(v).trim()));

const base44WmLeadSchema = z.object({
  id: z.coerce.string().trim().min(1),
  prenom: optionalTrimmedString,
  nom: optionalTrimmedString,
  email: optionalTrimmedString,
  telephone: optionalTrimmedString,
  q1: optionalTrimmedString,
  q2: optionalTrimmedString,
  q3: optionalTrimmedString,
  q4: optionalTrimmedString,
  q5: optionalTrimmedString,
  source: optionalTrimmedString,
  status: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v == null) return null;
      const trimmed = String(v).trim().toLowerCase();
      return trimmed || null;
    })
    .optional(),
  created_date: z.coerce.string().trim().min(1).nullish(),
  updated_date: z.coerce.string().trim().min(1).nullish(),
});

export type MappedWmLead = {
  category_id: string;
  lead_unit_type: "single" | "family";
  phone: string;
  zip_code?: string | null;
  first_name: string;
  last_name: string;
  country: string;
  summary: string;
  review_status: string | null;
  source_system: "wmleads";
  source_external_id: string;
  source_payload: Record<string, unknown>;
  source_created_at: string | null;
  source_updated_at: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  converted: "Converted",
};

const SOURCE_LABELS: Record<string, string> = {
  wm: "WM",
  "wm-ob": "WM OB",
};

function humanizeCode(value: string) {
  return value
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function labelValue(value: string | null | undefined, labels: Record<string, string>) {
  if (!value?.trim()) return null;
  const key = value.trim().toLowerCase();
  return labels[key] ?? humanizeCode(key);
}

function summaryPart(label: string, value: string | null | undefined) {
  if (!value?.trim()) return null;
  return `${label}: ${value.trim()}`;
}

function buildWmLeadSummary(input: z.infer<typeof base44WmLeadSchema>) {
  const parts = [
    summaryPart("Interest in wealth management", input.q1),
    summaryPart("Main wealth concern", input.q2),
    summaryPart("Current wealth manager", input.q3),
    summaryPart("Portfolio size bracket", input.q4),
    summaryPart("Primary goal", input.q5),
    summaryPart("page source", labelValue(input.source, SOURCE_LABELS)),
    summaryPart("status", labelValue(input.status, STATUS_LABELS)),
  ].filter((part): part is string => Boolean(part));

  return parts.join(" - ").slice(0, 2000);
}

function getDefaultCountry() {
  const country = process.env.WMLEADS_DEFAULT_COUNTRY?.trim();
  return country && country.length > 0 ? country : "Unknown";
}

export function mapBase44WmLeadToInventoryLead(
  raw: Base44WmLead,
  categoryId: string
): { ok: true; data: MappedWmLead } | { ok: false; reason: string } {
  const status = typeof raw.status === "string" ? raw.status.trim().toLowerCase() : "";
  if (status !== REQUIRED_STATUS) {
    return { ok: false, reason: `status_not_new:${status || "missing"}` };
  }

  const parsed = base44WmLeadSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  const input = parsed.data;

  if (!input.telephone) {
    return { ok: false, reason: "missing_phone" };
  }
  if (!input.prenom && !input.nom) {
    return { ok: false, reason: "missing_name" };
  }

  return {
    ok: true,
    data: {
      category_id: categoryId,
      lead_unit_type: "single",
      phone: input.telephone,
      zip_code: null,
      first_name: input.prenom,
      last_name: input.nom,
      country: getDefaultCountry(),
      summary: buildWmLeadSummary(input),
      review_status: null,
      source_system: "wmleads",
      source_external_id: input.id,
      source_payload: raw as Record<string, unknown>,
      source_created_at: input.created_date ?? null,
      source_updated_at: input.updated_date ?? input.created_date ?? null,
    },
  };
}
