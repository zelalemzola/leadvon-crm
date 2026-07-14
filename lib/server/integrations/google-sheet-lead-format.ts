/** Pure formatters for outbound Google Sheet lead rows (no I/O). */

export function toTitleCaseName(value: string | null | undefined) {
  const trimmed = (value ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed
    .toLowerCase()
    .split(" ")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

/** South African local/national mobile format (leading 0), digits only. */
export function toSaLocalMobile(phone: string | null | undefined) {
  const raw = (phone ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("27") && digits.length >= 11) {
    return `0${digits.slice(2)}`;
  }
  if (digits.startsWith("0")) return digits;
  if (digits.length === 9) return `0${digits}`;
  return digits;
}

/** DD/MM/YYYY h:mmAM/PM in South Africa time (My Debt Hero READ ME format). */
export function formatGoogleSheetLeadDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Johannesburg",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const day = get("day");
  const month = get("month");
  const year = get("year");
  const hour = String(Number(get("hour") || "0"));
  const minute = get("minute").padStart(2, "0");
  const dayPeriod = get("dayPeriod").replace(/\s+/g, "").toUpperCase();

  return `${day}/${month}/${year} ${hour}:${minute}${dayPeriod}`;
}

/**
 * Standard LeadVon → Google Sheets row layout (A–G):
 * Creation Date/Time | Consumer Name | Consumer Surname | Email | Mobile | Ad Source | Qualifying
 * Email and Ad Source are left blank unless callers pass them later.
 */
export function buildGoogleSheetLeadRow(lead: {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  created_at: string;
  email?: string | null;
  ad_source?: string | null;
  qualifying?: string | null;
}): string[] {
  const email = (lead.email ?? "").trim().toLowerCase();
  const adSource = (lead.ad_source ?? "").trim();
  return [
    formatGoogleSheetLeadDateTime(lead.created_at),
    toTitleCaseName(lead.first_name),
    toTitleCaseName(lead.last_name),
    email,
    toSaLocalMobile(lead.phone),
    adSource,
    (lead.qualifying ?? "Qualified").trim() || "Qualified",
  ];
}

/** Accept a full Sheets URL or a raw spreadsheet id. */
export function parseGoogleSpreadsheetId(input: string | null | undefined) {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return null;
  const fromUrl = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (fromUrl?.[1]) return fromUrl[1];
  if (/^[a-zA-Z0-9-_]+$/.test(trimmed)) return trimmed;
  return null;
}
