export type SmsPlaceholderKey =
  | "first_name"
  | "last_name"
  | "full_name"
  | "phone"
  | "summary"
  | "status"
  | "category";

export type SmsPlaceholder = {
  key: SmsPlaceholderKey;
  label: string;
  description: string;
};

export const SMS_PLACEHOLDERS: SmsPlaceholder[] = [
  { key: "first_name", label: "First name", description: "Lead first name" },
  { key: "last_name", label: "Last name", description: "Lead last name" },
  { key: "full_name", label: "Full name", description: "First + last name" },
  { key: "phone", label: "Phone", description: "Lead phone number" },
  { key: "summary", label: "Summary", description: "Lead summary" },
  { key: "status", label: "Status", description: "Current lead status" },
  { key: "category", label: "Category", description: "Lead category name" },
];

export const SMS_PLACEHOLDER_KEYS = SMS_PLACEHOLDERS.map((p) => p.key);

const PLACEHOLDER_KEY_SET = new Set<string>(SMS_PLACEHOLDER_KEYS);

export function isValidSmsPlaceholderKey(key: string) {
  return PLACEHOLDER_KEY_SET.has(key.trim().toLowerCase());
}

export function formatSmsPlaceholder(key: string) {
  return `{{${key}}}`;
}
