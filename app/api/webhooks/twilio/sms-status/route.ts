import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { validateTwilioSignature } from "@/lib/integrations/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeDeliveryStatus(status: string) {
  const value = status.trim().toLowerCase();
  if (!value) return "unknown";
  return value;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const params = new URLSearchParams(rawBody);
  const payload = Object.fromEntries(params.entries());

  const messageSid = payload.MessageSid ?? payload.SmsSid ?? "";
  const messageStatus = normalizeDeliveryStatus(payload.MessageStatus ?? "");
  const errorMessage = payload.ErrorMessage ?? null;

  if (!messageSid || !messageStatus) {
    return NextResponse.json({ error: "Missing Twilio webhook payload" }, { status: 400 });
  }

  const shouldValidate = process.env.TWILIO_VALIDATE_WEBHOOK_SIGNATURE === "true";
  if (shouldValidate) {
    const signature = request.headers.get("x-twilio-signature");
    if (!signature) {
      return NextResponse.json({ error: "Missing Twilio signature" }, { status: 401 });
    }
    const isValid = validateTwilioSignature({
      url: request.url,
      signature,
      params: payload,
    });
    if (!isValid) {
      return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 401 });
    }
  }

  const service = createServiceClient();
  const { error } = await service.rpc("reconcile_sms_delivery", {
    p_twilio_sid: messageSid,
    p_delivery_status: messageStatus,
    p_error_message: errorMessage,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
