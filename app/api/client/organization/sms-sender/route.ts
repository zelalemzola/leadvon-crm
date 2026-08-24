import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { requireCustomerUser, writeCustomerAuditLog } from "@/lib/server/client/auth";

const e164Phone = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{6,14}$/, "Twilio from number must be E.164 (e.g. +14155550123)");

const messagingServiceSid = z
  .string()
  .trim()
  .regex(/^MG[0-9a-fA-F]{32}$/, "Messaging Service SID must look like MGxxxxxxxx...");

const schema = z
  .object({
    twilio_from_number: z.union([e164Phone, z.literal(""), z.null()]).optional(),
    twilio_messaging_service_sid: z
      .union([messagingServiceSid, z.literal(""), z.null()])
      .optional(),
  })
  .refine(
    (input) => !(input.twilio_from_number && input.twilio_messaging_service_sid),
    "Configure either Twilio number or messaging service SID, not both"
  );

export async function GET() {
  const auth = await requireCustomerUser();
  if ("error" in auth) return auth.error;

  const service = createServiceClient();
  const { data, error } = await service
    .from("organizations")
    .select("id, name, twilio_from_number, twilio_messaging_service_sid")
    .eq("id", auth.organizationId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function PATCH(request: Request) {
  const auth = await requireCustomerUser({ adminOnly: true });
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const twilioFromNumber =
    parsed.data.twilio_from_number === undefined
      ? undefined
      : parsed.data.twilio_from_number?.trim() || null;
  const twilioMessagingServiceSid =
    parsed.data.twilio_messaging_service_sid === undefined
      ? undefined
      : parsed.data.twilio_messaging_service_sid?.trim() || null;

  if (
    twilioFromNumber !== undefined &&
    twilioMessagingServiceSid !== undefined &&
    twilioFromNumber &&
    twilioMessagingServiceSid
  ) {
    return NextResponse.json(
      { error: "Use either Twilio number or messaging service SID, not both" },
      { status: 400 }
    );
  }

  const updatePayload: {
    twilio_from_number?: string | null;
    twilio_messaging_service_sid?: string | null;
  } = {};
  if (twilioFromNumber !== undefined) updatePayload.twilio_from_number = twilioFromNumber;
  if (twilioMessagingServiceSid !== undefined) {
    updatePayload.twilio_messaging_service_sid = twilioMessagingServiceSid;
  }
  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("organizations")
    .update(updatePayload)
    .eq("id", auth.organizationId)
    .select("id, name, twilio_from_number, twilio_messaging_service_sid")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeCustomerAuditLog({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    action: "organization_sms_sender_updated",
    entityType: "organization",
    entityId: auth.organizationId,
    details: {
      twilio_from_number_set: Boolean(data.twilio_from_number),
      twilio_messaging_service_sid_set: Boolean(data.twilio_messaging_service_sid),
    },
  });

  return NextResponse.json({ data });
}
