import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireCustomerUser, writeCustomerAuditLog } from "@/lib/server/client/auth";
import { bulkSendSmsSchema } from "@/lib/validation/sms";
import { sendLeadSms } from "@/lib/server/sms/send-lead-sms";
import { SMS_COST_CENTS } from "@/lib/sms/constants";

export async function POST(request: Request) {
  const auth = await requireCustomerUser();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = bulkSendSmsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const leadIds = Array.from(new Set(parsed.data.lead_ids));
  const service = createServiceClient();

  let messageBody = parsed.data.message?.trim() ?? "";
  if (parsed.data.template_id) {
    const { data: template, error: templateError } = await service
      .from("sms_templates")
      .select("id, body")
      .eq("id", parsed.data.template_id)
      .eq("organization_id", auth.organizationId)
      .maybeSingle();

    if (templateError || !template) {
      return NextResponse.json({ error: "SMS template not found" }, { status: 400 });
    }
    messageBody = template.body;
  }

  if (!messageBody) {
    return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  }

  const { data: balance } = await service
    .from("sms_balances")
    .select("balance_cents")
    .eq("organization_id", auth.organizationId)
    .maybeSingle();

  const requiredCents = leadIds.length * SMS_COST_CENTS;
  if (!balance || balance.balance_cents < requiredCents) {
    return NextResponse.json(
      {
        error: `Insufficient SMS balance. Need $${(requiredCents / 100).toFixed(2)} for ${leadIds.length} messages.`,
      },
      { status: 400 }
    );
  }

  const { data: leads, error: leadsError } = await service
    .from("customer_leads")
    .select("id")
    .eq("organization_id", auth.organizationId)
    .in("id", leadIds);

  if (leadsError) {
    return NextResponse.json({ error: leadsError.message }, { status: 400 });
  }

  const allowed = new Set((leads ?? []).map((l) => l.id));
  const statusCallbackUrl = new URL("/api/webhooks/twilio/sms-status", request.url).toString();

  const results: {
    lead_id: string;
    ok: boolean;
    error?: string;
    message_id?: string;
  }[] = [];

  for (const leadId of leadIds) {
    if (!allowed.has(leadId)) {
      results.push({ lead_id: leadId, ok: false, error: "Lead not found" });
      continue;
    }

    const result = await sendLeadSms({
      organizationId: auth.organizationId,
      leadId,
      body: messageBody,
      actorId: auth.userId,
      statusCallbackUrl,
    });

    if (result.ok) {
      results.push({ lead_id: leadId, ok: true, message_id: String(result.messageId) });
    } else {
      results.push({ lead_id: leadId, ok: false, error: result.error });
    }
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.length - sent;

  await writeCustomerAuditLog({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    action: "sms_sent_bulk",
    entityType: "organization",
    entityId: auth.organizationId,
    details: {
      requested: leadIds.length,
      sent,
      failed,
      template_id: parsed.data.template_id ?? null,
    },
  });

  return NextResponse.json({
    data: {
      sent,
      failed,
      results,
    },
  });
}
