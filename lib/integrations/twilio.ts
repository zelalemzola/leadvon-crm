import twilio from "twilio";

export type TwilioSenderConfig = {
  fromNumber?: string | null;
  messagingServiceSid?: string | null;
};

function resolveSender(config?: TwilioSenderConfig) {
  const from = config?.fromNumber?.trim() || process.env.TWILIO_FROM_NUMBER;
  const messagingServiceSid =
    config?.messagingServiceSid?.trim() || process.env.TWILIO_MESSAGING_SERVICE_SID;
  return { from, messagingServiceSid };
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
