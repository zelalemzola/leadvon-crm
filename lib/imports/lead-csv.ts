import Papa from "papaparse";
import { z } from "zod";
import { resolveReviewStatusInput } from "../integrations/review-status";

export type LeadCsvCategory = {
  id: string;
  name: string;
  slug: string;
};

export type ParsedLeadCsvRow = {
  rowNumber: number;
  category_id: string;
  lead_unit_type: "single" | "family";
  phone: string;
  first_name: string;
  last_name: string;
  country: string;
  summary: string;
  zip_code: string | null;
  review_status: string | null;
};

export type LeadCsvRowError = {
  rowNumber: number;
  errors: string[];
};

export type LeadCsvParseResult = {
  ok: boolean;
  headers: string[];
  mappedHeaders: Record<string, string>;
  validRows: ParsedLeadCsvRow[];
  invalidRows: LeadCsvRowError[];
  fileErrors: string[];
};

const PHONE_ALIASES = new Set([
  "phone",
  "phone_number",
  "telephone",
  "mobile",
  "mobile_number",
  "whatsapp",
  "whatsapp_number",
  "tel",
]);

const FIRST_NAME_ALIASES = new Set([
  "first_name",
  "firstname",
  "first",
  "prenom",
  "fname",
]);

const LAST_NAME_ALIASES = new Set([
  "last_name",
  "lastname",
  "last",
  "nom",
  "surname",
  "lname",
]);

const FULL_NAME_ALIASES = new Set([
  "full_name",
  "fullname",
  "name",
  "contact_name",
]);

const CATEGORY_ALIASES = new Set([
  "category",
  "category_name",
  "category_id",
  "category_slug",
  "lead_category",
]);

const COUNTRY_ALIASES = new Set(["country", "country_name", "nation"]);
const SUMMARY_ALIASES = new Set(["summary", "notes", "description", "comment"]);
const ZIP_ALIASES = new Set(["zip", "zip_code", "postal_code", "postcode", "province"]);
const UNIT_ALIASES = new Set(["lead_unit_type", "unit_type", "unit", "lead_type"]);
const REVIEW_STATUS_ALIASES = new Set([
  "review_status",
  "reviewstatus",
  "review",
  "status_review",
]);

export const LEAD_CSV_TEMPLATE_HEADERS = [
  "first_name",
  "last_name",
  "phone",
  "category",
  "country",
  "lead_unit_type",
  "review_status",
  "summary",
  "zip_code",
] as const;

function normalizeHeader(raw: string) {
  return raw
    .trim()
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function canonicalField(header: string): string | null {
  if (PHONE_ALIASES.has(header)) return "phone";
  if (FIRST_NAME_ALIASES.has(header)) return "first_name";
  if (LAST_NAME_ALIASES.has(header)) return "last_name";
  if (FULL_NAME_ALIASES.has(header)) return "full_name";
  if (CATEGORY_ALIASES.has(header)) return "category";
  if (COUNTRY_ALIASES.has(header)) return "country";
  if (SUMMARY_ALIASES.has(header)) return "summary";
  if (ZIP_ALIASES.has(header)) return "zip_code";
  if (UNIT_ALIASES.has(header)) return "lead_unit_type";
  if (REVIEW_STATUS_ALIASES.has(header)) return "review_status";
  return null;
}

function normalizeSpace(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

export function normalizeLeadCsvPhone(raw: string) {
  const trimmed = normalizeSpace(raw);
  if (!trimmed) return "";
  const normalized = trimmed.replace(/[^\d+]/g, "");
  return normalized.slice(0, 32);
}

function splitFullName(full: string): { first_name: string; last_name: string } {
  const parts = normalizeSpace(full).split(" ").filter(Boolean);
  if (parts.length === 0) return { first_name: "", last_name: "" };
  if (parts.length === 1) return { first_name: parts[0]!, last_name: "" };
  return {
    first_name: parts[0]!,
    last_name: parts.slice(1).join(" "),
  };
}

function buildCategoryLookup(categories: LeadCsvCategory[]) {
  const byName = new Map<string, string>();
  const bySlug = new Map<string, string>();
  const byId = new Map<string, string>();

  for (const category of categories) {
    byName.set(category.name.trim().toLowerCase(), category.id);
    bySlug.set(category.slug.trim().toLowerCase(), category.id);
    byId.set(category.id.trim().toLowerCase(), category.id);
  }

  return { byName, bySlug, byId };
}

function resolveCategoryId(
  raw: string,
  lookup: ReturnType<typeof buildCategoryLookup>
): string | null {
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  return lookup.byId.get(key) ?? lookup.bySlug.get(key) ?? lookup.byName.get(key) ?? null;
}

const leadCsvRowSchema = z
  .object({
    category_id: z.string().uuid(),
    lead_unit_type: z.enum(["single", "family"]).default("single"),
    phone: z.string().trim().min(4).max(32),
    first_name: z.string().trim().max(120).default(""),
    last_name: z.string().trim().max(120).default(""),
    country: z.string().trim().min(1).max(120).default("Unknown"),
    summary: z.string().max(2000).default(""),
    zip_code: z.string().trim().max(64).nullable().optional(),
    review_status: z.string().trim().max(64).nullable().optional(),
  })
  .refine((row) => row.first_name.length > 0 || row.last_name.length > 0, {
    message: "At least first_name or last_name is required",
    path: ["first_name"],
  });

function extractReviewStatusFromSummary(summary: string) {
  const match = summary.match(/(?:^|\s*-\s*)review_status:\s*([^-\n]+)/i);
  if (!match) {
    return { review_status: null as string | null, summary };
  }

  const review_status = resolveReviewStatusInput(match[1]);
  const cleaned = summary
    .replace(/(?:^|\s*-\s*)review_status:\s*[^-\n]+/i, "")
    .replace(/\s*-\s*-\s*/g, " - ")
    .replace(/^\s*-\s*/, "")
    .replace(/\s*-\s*$/, "")
    .trim();

  return { review_status, summary: cleaned.slice(0, 2000) };
}

export function buildLeadCsvTemplateCsv() {
  const example = [
    "Ada",
    "Lovelace",
    "+14155550123",
    "Debt Review",
    "United States",
    "single",
    "yes_review",
    "Interested in debt review",
    "10001",
  ];
  return [LEAD_CSV_TEMPLATE_HEADERS.join(","), example.map((v) => `"${v}"`).join(",")].join("\n");
}

export function parseLeadCsvText(
  text: string,
  categories: LeadCsvCategory[]
): LeadCsvParseResult {
  const fileErrors: string[] = [];
  const validRows: ParsedLeadCsvRow[] = [];
  const invalidRows: LeadCsvRowError[] = [];
  const mappedHeaders: Record<string, string> = {};

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => normalizeHeader(header),
  });

  if (parsed.errors.length > 0) {
    for (const err of parsed.errors.slice(0, 5)) {
      fileErrors.push(err.message);
    }
  }

  const rawHeaders = parsed.meta.fields ?? [];
  if (rawHeaders.length === 0) {
    return {
      ok: false,
      headers: [],
      mappedHeaders,
      validRows,
      invalidRows,
      fileErrors: fileErrors.length > 0 ? fileErrors : ["CSV has no header row"],
    };
  }

  const headerToField = new Map<string, string>();
  for (const header of rawHeaders) {
    const field = canonicalField(header);
    if (!field) continue;
    if (!headerToField.has(field)) {
      headerToField.set(field, header);
      mappedHeaders[header] = field;
    }
  }

  const hasPhone = headerToField.has("phone");
  const hasName =
    headerToField.has("first_name") ||
    headerToField.has("last_name") ||
    headerToField.has("full_name");
  const hasCategory = headerToField.has("category");

  if (!hasPhone) fileErrors.push("Missing phone column (phone, telephone, mobile, etc.)");
  if (!hasName) {
    fileErrors.push(
      "Missing name column (first_name, last_name, full_name, name, etc.)"
    );
  }
  if (!hasCategory) {
    fileErrors.push("Missing category column (category, category_name, category_id, etc.)");
  }

  if (fileErrors.length > 0) {
    return {
      ok: false,
      headers: rawHeaders,
      mappedHeaders,
      validRows,
      invalidRows,
      fileErrors,
    };
  }

  const categoryLookup = buildCategoryLookup(categories);
  const dataRows = parsed.data;

  if (dataRows.length === 0) {
    return {
      ok: false,
      headers: rawHeaders,
      mappedHeaders,
      validRows,
      invalidRows,
      fileErrors: ["CSV has no data rows"],
    };
  }

  dataRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const rowErrors: string[] = [];

    const read = (field: string) => {
      const header = headerToField.get(field);
      if (!header) return "";
      return normalizeSpace(String(row[header] ?? ""));
    };

    let first_name = read("first_name");
    let last_name = read("last_name");
    const full_name = read("full_name");
    if (full_name) {
      const split = splitFullName(full_name);
      if (!first_name) first_name = split.first_name;
      if (!last_name) last_name = split.last_name;
    }

    const phone = normalizeLeadCsvPhone(read("phone"));
    const categoryRaw = read("category");
    const category_id = resolveCategoryId(categoryRaw, categoryLookup);
    if (!category_id) {
      rowErrors.push(
        categoryRaw
          ? `Unknown category "${categoryRaw}"`
          : "Category is required"
      );
    }

    const unitRaw = read("lead_unit_type").toLowerCase();
    const lead_unit_type: "single" | "family" = unitRaw === "family" ? "family" : "single";
    const country = read("country") || "Unknown";
    let summary = read("summary").slice(0, 2000);
    const zipRaw = read("zip_code");
    const zip_code = zipRaw ? zipRaw : null;

    let review_status = resolveReviewStatusInput(read("review_status"));
    if (!review_status) {
      const extracted = extractReviewStatusFromSummary(summary);
      review_status = extracted.review_status;
      summary = extracted.summary;
    }

    if (!phone) rowErrors.push("Phone is required");
    else if (phone.length < 4) rowErrors.push("Phone must be at least 4 characters");
    if (!first_name && !last_name) {
      rowErrors.push("At least first_name or last_name is required");
    }

    if (rowErrors.length > 0) {
      invalidRows.push({ rowNumber, errors: rowErrors });
      return;
    }

    const validated = leadCsvRowSchema.safeParse({
      category_id,
      lead_unit_type,
      phone,
      first_name,
      last_name,
      country,
      summary,
      zip_code,
      review_status,
    });

    if (!validated.success) {
      invalidRows.push({
        rowNumber,
        errors: validated.error.issues.map((issue) => issue.message),
      });
      return;
    }

    validRows.push({
      rowNumber,
      ...validated.data,
      zip_code: validated.data.zip_code ?? null,
      review_status: validated.data.review_status ?? null,
    });
  });

  return {
    ok: validRows.length > 0 && fileErrors.length === 0,
    headers: rawHeaders,
    mappedHeaders,
    validRows,
    invalidRows,
    fileErrors,
  };
}
