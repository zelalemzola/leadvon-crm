import { createServiceClient } from "@/lib/supabase/service";
import { sendNewLeadEmail } from "@/lib/email/resend";

type PendingLeadNotification = {
  id: string;
  recipient_id: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  profiles: {
    email: string | null;
    full_name: string | null;
  } | null;
};

export async function processPendingLeadEmails(limit = 25) {
  const service = createServiceClient();
  const { data: pending, error } = await service
    .from("customer_notifications")
    .select("id, recipient_id, entity_id, metadata, profiles:recipient_id(email, full_name)")
    .eq("type", "lead_received")
    .is("email_sent_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    return { processed: 0, sent: 0, skipped: 0, failed: 0, error: error.message };
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const rawRow of pending ?? []) {
    const row = rawRow as PendingLeadNotification & {
      profiles: PendingLeadNotification["profiles"] | PendingLeadNotification["profiles"][];
    };
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const recipientEmail = profile?.email?.trim();
    const metadata = row.metadata ?? {};
    const leadName = String(metadata.lead_name ?? "New lead");
    const categoryName = String(metadata.category_name ?? "");
    const phone = String(metadata.phone ?? "");
    const country = String(metadata.country ?? "");
    const zipCode = metadata.zip_code ? String(metadata.zip_code) : null;
    let assignedAgentName: string | null = null;
    let resolvedCountry = country;
    let resolvedZipCode = zipCode;

    if (row.entity_id) {
      const { data: lead } = await service
        .from("customer_leads")
        .select("assigned_to, country, zip_code, assignee:profiles!customer_leads_assigned_to_fkey(full_name, email)")
        .eq("id", row.entity_id)
        .maybeSingle();
      if (lead) {
        const assignee = lead.assignee as { full_name?: string | null; email?: string | null } | null;
        assignedAgentName = assignee?.full_name || assignee?.email || null;
        resolvedCountry = lead.country || resolvedCountry;
        resolvedZipCode = lead.zip_code || resolvedZipCode;
      }
    }

    const result = await sendNewLeadEmail({
      to: recipientEmail ?? "",
      recipientName: profile?.full_name ?? "",
      leadName,
      categoryName,
      phone,
      country: resolvedCountry,
      zipCode: resolvedZipCode,
      assignedAgentName,
    });

    if (result.ok) {
      await service
        .from("customer_notifications")
        .update({ email_sent_at: new Date().toISOString() })
        .eq("id", row.id);
      sent += 1;
      continue;
    }

    if (result.skipped) {
      skipped += 1;
      continue;
    }

    failed += 1;
  }

  return {
    processed: (pending ?? []).length,
    sent,
    skipped,
    failed,
  };
}

export async function createLeadStatusNotifications(input: {
  organizationId: string;
  leadId: string;
  actorId: string;
  leadName: string;
  oldStatus: string;
  newStatus: string;
  assignedTo?: string | null;
}) {
  const service = createServiceClient();
  const recipients = new Set<string>();

  const { data: admins } = await service
    .from("profiles")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("role", "customer_admin")
    .eq("is_active", true);
  for (const admin of admins ?? []) {
    if (admin.id !== input.actorId) recipients.add(admin.id);
  }

  if (input.assignedTo && input.assignedTo !== input.actorId) {
    recipients.add(input.assignedTo);
  }

  if (recipients.size === 0) return;

  const title = "Lead status updated";
  const body = `${input.leadName} changed from ${input.oldStatus.replaceAll("_", " ")} to ${input.newStatus.replaceAll("_", " ")}.`;

  await service.from("customer_notifications").insert(
    [...recipients].map((recipientId) => ({
      organization_id: input.organizationId,
      recipient_id: recipientId,
      type: "lead_status_changed",
      title,
      body,
      entity_type: "customer_lead",
      entity_id: input.leadId,
      metadata: {
        lead_name: input.leadName,
        old_status: input.oldStatus,
        new_status: input.newStatus,
        actor_id: input.actorId,
      },
    }))
  );
}
