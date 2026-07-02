export const SMS_COMING_SOON_CODE = "sms_coming_soon";

export function isSmsFeatureEnabled() {
  const flag = process.env.SMS_FEATURE_ENABLED?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "no") return false;
  return true;
}

export function getSmsComingSoonMessage() {
  return "SMS is coming soon. This feature is not available yet.";
}
