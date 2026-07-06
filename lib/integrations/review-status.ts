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
] as const;

export function normalizeReviewStatusCode(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return value.trim().toLowerCase();
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
