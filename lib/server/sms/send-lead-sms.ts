import { createServiceClient } from "@/lib/supabase/service";
import { isTwilioConfigured, normalizePhoneForSms, sendTwilioSms } from "@/lib/integrations/twilio";
import { SMS_COST_CENTS } from "@/lib/sms/constants";
import { renderSmsTemplate } from "@/lib/server/sms/templates";

type SendLeadSmsInput = {
  organizationId: string;
  leadId: string;
  body: string;
  actorId?: string | null;
  automationId?: string | null;
  statusCallbackUrl?: string;
};

export async function sendLeadSms(input: SendLeadSmsInput) {
  const service = createServiceClient();

  const { data: lead, error: leadError } = await service
    .from("customer_leads")
    .select("id, organization_id, phone, first_name, last_name, summary, status, categories(name)")
    .eq("id", input.leadId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (leadError || !lead) {
    return { ok: false as const, error: "Lead not found" };
  }

  const toPhone = normalizePhoneForSms(lead.phone);
  if (!toPhone) {
    return { ok: false as const, error: "Lead phone number is invalid" };
  }

  const categoryName =
    (lead as { categories?: { name?: string } | null }).categories?.name ?? "";
  const body = renderSmsTemplate(input.body, {
    first_name: lead.first_name,
    last_name: lead.last_name,
    phone: lead.phone,
    summary: lead.summary,
    status: lead.status,
    category_name: categoryName,
  }).trim();

  if (!body) {
    return { ok: false as const, error: "SMS message is empty" };
  }

  const { data: balance } = await service
    .from("sms_balances")
    .select("balance_cents")
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (!balance || balance.balance_cents < SMS_COST_CENTS) {
    return { ok: false as const, error: "Insufficient SMS balance" };
  }

  const { data: orgSettings } = await service
    .from("organizations")
    .select("twilio_from_number, twilio_messaging_service_sid")
    .eq("id", input.organizationId)
    .maybeSingle();

  if (
    !isTwilioConfigured({
      fromNumber: orgSettings?.twilio_from_number,
      messagingServiceSid: orgSettings?.twilio_messaging_service_sid,
    })
  ) {
    return { ok: false as const, error: "SMS provider is not configured" };
  }

  try {
    const twilioResult = await sendTwilioSms(toPhone, body, {
      statusCallbackUrl: input.statusCallbackUrl,
      sender: {
        fromNumber: orgSettings?.twilio_from_number,
        messagingServiceSid: orgSettings?.twilio_messaging_service_sid,
      },
    });
    const { data: messageId, error: recordError } = await service.rpc("record_sms_send", {
      p_organization_id: input.organizationId,
      p_customer_lead_id: input.leadId,
      p_automation_id: input.automationId ?? null,
      p_actor_id: input.actorId ?? null,
      p_to_phone: toPhone,
      p_body: body,
      p_cost_cents: SMS_COST_CENTS,
      p_twilio_sid: twilioResult.sid,
      p_delivery_status: twilioResult.status,
      p_error_message: null,
    });

    if (recordError) {
      return { ok: false as const, error: recordError.message };
    }

    return { ok: true as const, messageId, twilioSid: twilioResult.sid };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send SMS";
    return { ok: false as const, error: message };
  }
}
