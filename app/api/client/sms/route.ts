import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireCustomerUser, writeCustomerAuditLog } from "@/lib/server/client/auth";
import { sendLeadSmsSchema } from "@/lib/validation/sms";
import { sendLeadSms } from "@/lib/server/sms/send-lead-sms";

export async function POST(request: Request) {
  const auth = await requireCustomerUser();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = sendLeadSmsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await sendLeadSms({
    organizationId: auth.organizationId,
    leadId: parsed.data.lead_id,
    body: parsed.data.message,
    actorId: auth.userId,
    statusCallbackUrl: new URL("/api/webhooks/twilio/sms-status", request.url).toString(),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await writeCustomerAuditLog({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    action: "sms_sent_manual",
    entityType: "customer_lead",
    entityId: parsed.data.lead_id,
    details: { message_id: result.messageId },
  });

  return NextResponse.json({ data: { message_id: result.messageId, twilio_sid: result.twilioSid } });
}

export async function GET() {
  const auth = await requireCustomerUser();
  if ("error" in auth) return auth.error;

  const service = createServiceClient();
  const [balanceRes, messagesRes, transactionsRes] = await Promise.all([
    service
      .from("sms_balances")
      .select("*")
      .eq("organization_id", auth.organizationId)
      .maybeSingle(),
    service
      .from("sms_messages")
      .select("*, customer_leads(first_name, last_name)")
      .eq("organization_id", auth.organizationId)
      .order("created_at", { ascending: false })
      .limit(100),
    service
      .from("sms_transactions")
      .select("*")
      .eq("organization_id", auth.organizationId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (balanceRes.error) {
    return NextResponse.json({ error: balanceRes.error.message }, { status: 400 });
  }
  if (messagesRes.error) {
    return NextResponse.json({ error: messagesRes.error.message }, { status: 400 });
  }
  if (transactionsRes.error) {
    return NextResponse.json({ error: transactionsRes.error.message }, { status: 400 });
  }

  return NextResponse.json({
    data: {
      balance: balanceRes.data,
      messages: messagesRes.data ?? [],
      transactions: transactionsRes.data ?? [],
    },
  });
}
