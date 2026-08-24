import twilio from "twilio";

export type TwilioSenderConfig = {
  fromNumber?: string | null;
  messagingServiceSid?: string | null;
};

/**
 * Org-configured sender fully overrides platform defaults.
 * If the org sets a from-number only, do not fall through to env Messaging Service SID
 * (and vice versa). Mixing those caused org from-numbers to be ignored whenever
 * TWILIO_MESSAGING_SERVICE_SID was set on the platform.
 */
function resolveSender(config?: TwilioSenderConfig) {
  const orgFrom = config?.fromNumber?.trim() || "";
  const orgMessagingServiceSid = config?.messagingServiceSid?.trim() || "";

  if (orgFrom || orgMessagingServiceSid) {
    return {
      from: orgFrom || undefined,
      messagingServiceSid: orgMessagingServiceSid || undefined,
    };
  }

  return {
    from: process.env.TWILIO_FROM_NUMBER?.trim() || undefined,
    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || undefined,
  };
}

export function isTwilioConfigured(config?: TwilioSenderConfig) {
  const { from, messagingServiceSid } = resolveSender(config);
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (from || messagingServiceSid)
  );
}

export function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials are not configured");
  }
  return twilio(accountSid, authToken);
}

export function normalizePhoneForSms(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (phone.trim().startsWith("+")) return `+${digits}`;
  return `+${digits}`;
}

export async function sendTwilioSms(
  to: string,
  body: string,
  options?: {
    statusCallbackUrl?: string;
    sender?: TwilioSenderConfig;
  }
) {
  const client = getTwilioClient();
  const { from, messagingServiceSid } = resolveSender(options?.sender);
  if (!from && !messagingServiceSid) {
    throw new Error("No Twilio sender is configured");
  }

  const message = await client.messages.create({
    to,
    body,
    ...(options?.statusCallbackUrl ? { statusCallback: options.statusCallbackUrl } : {}),
    ...(messagingServiceSid ? { messagingServiceSid } : { from: from! }),
  });

  return {
    sid: message.sid,
    status: message.status,
  };
}

export function validateTwilioSignature(input: {
  url: string;
  signature: string;
  params: Record<string, string>;
}) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return false;
  return twilio.validateRequest(authToken, input.signature, input.url, input.params);
}
