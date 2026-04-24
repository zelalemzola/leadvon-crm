import { z } from "zod";
import type { Base44Lead } from "@/lib/integrations/base44";

const base44LeadSchema = z.object({
  id: z.coerce.string().trim().min(1),
  prenom: z.coerce.string().trim().min(1),
  nom: z.coerce.string().trim().min(1),
  telephone: z.coerce.string().trim().min(4),
  email: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (typeof v === "string" ? v.trim() : undefined))
    .optional(),
  age: z.coerce.number().int().positive().optional(),
  besoins: z.array(z.string()).nullish(),
  couvert_mutuelle: z.string().nullish(),
  mutuelle_actuelle: z.string().nullish(),
  cotisation_mensuelle: z.string().nullish(),
  qui_assurer: z.string().nullish(),
  profession: z.string().nullish(),
  consent_telephone: z.boolean().optional(),
  consent_marketing: z.boolean().optional(),
  status: z.enum(["new", "contacted", "converted"]).nullish(),
  // Base44 timestamps are not always strict RFC3339; keep raw value when present.
  created_date: z.coerce.string().trim().min(1).nullish(),
  updated_date: z.coerce.string().trim().min(1).nullish(),
  created_by: z.string().nullish(),
});

export type MappedBase44Lead = {
  category_id: string;
  lead_unit_type: "single" | "family";
  phone: string;
  first_name: string;
  last_name: string;
  country: string;
  summary: string;
  source_system: "base44";
  source_external_id: string;
  source_payload: Record<string, unknown>;
  source_created_at: string | null;
  source_updated_at: string | null;
};

function normalizeExternalValue(value: string) {
  return value.trim().toLowerCase();
}

function toSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function toTitleCaseWords(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function readStringField(raw: Base44Lead, key: string): string | null {
  const value = (raw as Record<string, unknown>)[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getBase44CategoryCandidates(raw: Base44Lead): string[] {
  const out: string[] = [];
  const add = (value: string | null) => {
    if (!value) return;
    const normalized = normalizeExternalValue(value);
    if (!out.includes(normalized)) out.push(normalized);
  };

  add(readStringField(raw, "category"));
  add(readStringField(raw, "category_slug"));
  add(readStringField(raw, "product"));
  add(readStringField(raw, "vertical"));

  if (Array.isArray(raw.besoins)) {
    for (const item of raw.besoins) {
      if (typeof item === "string") add(item);
    }
  }

  return out;
}

const categoryTranslations: Record<string, string> = {
  mutuelle: "Health Insurance",
  sante: "Health Insurance",
  "assurance sante": "Health Insurance",
  "health insurance": "Health Insurance",
  dentaire: "Dental Insurance",
  optique: "Vision Insurance",
  hospitalisation: "Hospital Coverage",
  prevoyance: "Income Protection",
  retraite: "Retirement Plan",
};

export function translateBase44CategoryToEnglish(value: string): { name: string; slug: string } {
  const normalized = normalizeExternalValue(value);
  const translated = categoryTranslations[normalized] ?? toTitleCaseWords(normalized.replace(/[-_]+/g, " "));
  const slug = toSlug(translated || normalized || "general-insurance") || "general-insurance";
  return { name: translated || "General Insurance", slug };
}

function inferLeadUnitType(quiAssurer?: string | null): "single" | "family" {
  const text = (quiAssurer ?? "").toLowerCase();
  if (!text) return "single";
  if (text.includes("famille")) return "family";
  if (text.includes("conjoint") || text.includes("enfant") || text.includes("foyer")) return "family";
  return "single";
}

function buildSummary(input: z.infer<typeof base44LeadSchema>) {
  const parts: string[] = [];
  if (input.email) parts.push(`Email: ${input.email}`);
  if (typeof input.age === "number") parts.push(`Age: ${input.age}`);
  if (input.qui_assurer) parts.push(`Coverage target: ${input.qui_assurer}`);
  if (input.profession) parts.push(`Profession: ${input.profession}`);
  if (input.couvert_mutuelle) parts.push(`Has mutual cover: ${input.couvert_mutuelle}`);
  if (input.mutuelle_actuelle) parts.push(`Current insurer: ${input.mutuelle_actuelle}`);
  if (input.cotisation_mensuelle) parts.push(`Monthly premium: ${input.cotisation_mensuelle}`);
  if (Array.isArray(input.besoins) && input.besoins.length > 0) {
    parts.push(`Needs: ${input.besoins.join(", ")}`);
  }
  if (input.status) parts.push(`Source status: ${input.status}`);
  if (typeof input.consent_telephone === "boolean") {
    parts.push(`Phone consent: ${input.consent_telephone ? "yes" : "no"}`);
  }
  if (typeof input.consent_marketing === "boolean") {
    parts.push(`Marketing consent: ${input.consent_marketing ? "yes" : "no"}`);
  }
  return parts.join(" | ").slice(0, 2000);
}

export function mapBase44LeadToInventoryLead(
  raw: Base44Lead,
  categoryId: string
): { ok: true; data: MappedBase44Lead } | { ok: false; reason: string } {
  const parsed = base44LeadSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  const input = parsed.data;
  return {
    ok: true,
    data: {
      category_id: categoryId,
      lead_unit_type: inferLeadUnitType(input.qui_assurer),
      phone: input.telephone.trim(),
      first_name: input.prenom.trim(),
      last_name: input.nom.trim(),
      country: "France",
      summary: buildSummary(input),
      source_system: "base44",
      source_external_id: input.id,
      source_payload: raw as Record<string, unknown>,
      source_created_at: input.created_date ?? null,
      source_updated_at: input.updated_date ?? input.created_date ?? null,
    },
  };
}
