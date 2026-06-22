import { formatDistanceToNow } from "date-fns";

type LeadIdSource = {
  id: string;
  source_lead?: { source_external_id?: string | null } | null;
};

export function formatLeadDisplayId(lead: LeadIdSource) {
  const externalId = lead.source_lead?.source_external_id?.trim();
  if (externalId) {
    const numeric = externalId.replace(/\D/g, "");
    if (numeric) return `L-${numeric}`;
    return `L-${externalId.slice(0, 8).toUpperCase()}`;
  }
  const compact = lead.id.replace(/-/g, "").slice(0, 5).toUpperCase();
  return `L-${compact}`;
}

export function formatPhoneForDisplay(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return phone;
  if (digits.startsWith("33") && digits.length >= 11) {
    const local = digits.slice(2);
    return `+33 ${local.replace(/(\d)(?=(\d{2})+(?!\d))/g, "$1 ").trim()}`;
  }
  if (digits.length === 10) {
    return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  }
  return phone;
}

export function whatsappUrl(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}

export function formatLeadRelativeTime(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "-";
  }
}

export function formatLeadLocation(row: {
  zip_code?: string | null;
  postal_code?: string | null;
  country?: string | null;
}) {
  return row.zip_code?.trim() || row.postal_code?.trim() || "-";
}
