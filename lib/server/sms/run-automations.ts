import { createServiceClient } from "@/lib/supabase/service";
import { sendLeadSms } from "@/lib/server/sms/send-lead-sms";

export async function runSmsAutomationsForStatusChange(input: {
  organizationId: string;
  leadId: string;
  newStatus: string;
  actorId: string;
  statusCallbackUrl?: string;
}) {
  const service = createServiceClient();
  const { data: automations, error } = await service
    .from("sms_automations")
    .select("id, message_template")
    .eq("organization_id", input.organizationId)
    .eq("trigger_status", input.newStatus)
    .eq("is_active", true);

  if (error || !automations?.length) {
    return { sent: 0, failures: [] as string[] };
  }

  let sent = 0;
  const failures: string[] = [];

  for (const automation of automations) {
    const result = await sendLeadSms({
      organizationId: input.organizationId,
      leadId: input.leadId,
      body: automation.message_template,
      actorId: input.actorId,
      automationId: automation.id,
      statusCallbackUrl: input.statusCallbackUrl,
    });
    if (result.ok) {
      sent += 1;
    } else {
      failures.push(result.error);
    }
  }

  return { sent, failures };
}
