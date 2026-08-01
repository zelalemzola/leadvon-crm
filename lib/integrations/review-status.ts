export const REVIEW_STATUS_LABELS: Record<string, string> = {
  no: "No",
  yes: "Yes",
  yes_review: "Yes Review",
  admin: "Admin review",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export const REVIEW_STATUS_OPTIONS = Object.entries(REVIEW_STATUS_LABELS).map(
  ([value, label]) => ({ value, label })
);

export const FREE_DELIVERY_SOURCE_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "base44", label: "Base44" },
  { value: "funnel", label: "Funnel" },
  { value: "wmleads", label: "WmLeads" },
] as const;

export function normalizeReviewStatusCode(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return value.trim().toLowerCase();
}

export function resolveReviewStatusInput(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const lowered = trimmed.toLowerCase();
  const slug = lowered.replace(/[\s-]+/g, "_");

  if (slug in REVIEW_STATUS_LABELS) return slug;

  for (const [code, label] of Object.entries(REVIEW_STATUS_LABELS)) {
    if (label.toLowerCase() === lowered) return code;
  }

  return slug.slice(0, 64);
}

function humanizeCode(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function reviewStatusLabel(value: string | null | undefined): string {
  const code = normalizeReviewStatusCode(value);
  if (!code) return "—";
  return REVIEW_STATUS_LABELS[code] ?? humanizeCode(code);
}
