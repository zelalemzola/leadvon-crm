import { z } from "zod";
import type { Base44SaLead } from "@/lib/integrations/base44";
import {
  normalizeReviewStatusCode,
} from "@/lib/integrations/review-status";

const REQUIRED_STATUS = "new";

const optionalTrimmedString = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => (v === null || v === undefined ? "" : String(v).trim()));

const base44SaLeadSchema = z.object({
  id: z.coerce.string().trim().min(1),
  prenom: optionalTrimmedString,
  nom: optionalTrimmedString,
  telephone: optionalTrimmedString,
  age: optionalTrimmedString,
  province: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (typeof v === "string" ? v.trim() : undefined))
    .optional(),
  work: z.string().nullish(),
  income: z.string().nullish(),
  debt: z.string().nullish(),
  review_status: z.string().nullish(),
  last_step: z.string().nullish(),
  status: z.enum(["new", "contacted", "converted"]).nullish(),
  created_date: z.coerce.string().trim().min(1).nullish(),
  updated_date: z.coerce.string().trim().min(1).nullish(),
});

export type MappedBase44Lead = {
  category_id: string;
  lead_unit_type: "single" | "family";
  phone: string;
  zip_code?: string | null;
  first_name: string;
  last_name: string;
  country: string;
  summary: string;
  review_status: string | null;
  source_system: "base44";
  source_external_id: string;
  source_payload: Record<string, unknown>;
  source_created_at: string | null;
  source_updated_at: string | null;
};

const WORK_LABELS: Record<string, string> = {
  full_time: "Full time",
  part_time: "Part time",
  pension: "Pension",
  unemployed: "Unemployed",
  self_employed: "Self employed",
  student: "Student",
  retired: "Retired",
};

const INCOME_LABELS: Record<string, string> = {
  under_5000: "Under R5,000",
  "5000_10000": "R5,000 – R10,000",
  "10000_30000": "R10,000 – R30,000",
  "30000_50000": "R30,000 – R50,000",
  over_50000: "Over R50,000",
};

const DEBT_LABELS: Record<string, string> = {
  under_50000: "Under R50,000",
  "50000_100000": "R50,000 – R100,000",
  "100000_200000": "R100,000 – R200,000",
  "200000_500000": "R200,000 – R500,000",
  over_500000: "Over R500,000",
  none: "No debt",
};

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  converted: "Converted",
};

function humanizeCode(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function labelValue(
  value: string | null | undefined,
  labels: Record<string, string>
) {
  if (!value?.trim()) return null;
  const key = value.trim().toLowerCase();
  return labels[key] ?? humanizeCode(key);
}

function summaryPart(label: string, value: string | null | undefined) {
  if (!value?.trim()) return null;
  return `${label}: ${value.trim()}`;
}

function buildSaLeadSummary(input: z.infer<typeof base44SaLeadSchema>) {
  const parts = [
    summaryPart("age", input.age),
    summaryPart("province", input.province),
    summaryPart("work", labelValue(input.work, WORK_LABELS)),
    summaryPart("income", labelValue(input.income, INCOME_LABELS)),
    summaryPart("debt", labelValue(input.debt, DEBT_LABELS)),
    summaryPart("status", labelValue(input.status, STATUS_LABELS)),
  ].filter((part): part is string => Boolean(part));

  return parts.join(" - ").slice(0, 2000);
}

export function mapBase44SaLeadToInventoryLead(
  raw: Base44SaLead,
  categoryId: string
): { ok: true; data: MappedBase44Lead } | { ok: false; reason: string } {
  const status = typeof raw.status === "string" ? raw.status.trim().toLowerCase() : "";
  if (status !== REQUIRED_STATUS) {
    return { ok: false, reason: `status_not_new:${status || "missing"}` };
  }

  const parsed = base44SaLeadSchema.safeParse(raw);
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
      zip_code: input.province?.trim() ? input.province.trim() : null,
      first_name: input.prenom,
      last_name: input.nom,
      country: "South Africa",
      summary: buildSaLeadSummary(input),
      review_status: normalizeReviewStatusCode(input.review_status),
      source_system: "base44",
      source_external_id: input.id,
      source_payload: raw as Record<string, unknown>,
      source_created_at: input.created_date ?? null,
      source_updated_at: input.updated_date ?? input.created_date ?? null,
    },
  };
}
