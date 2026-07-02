import { createServiceClient } from "@/lib/supabase/service";
import { sendNewLeadsDigestEmail } from "@/lib/email/resend";

type NotificationProfile = {
  email: string | null;
  full_name: string | null;
};

type PendingLeadNotificationRow = {
  id: string;
  recipient_id: string;
  profiles: NotificationProfile | NotificationProfile[] | null;
};

type RecipientDigest = {
  notificationIds: string[];
  email: string;
  fullName: string;
};

function normalizeProfile(profiles: PendingLeadNotificationRow["profiles"]) {
  if (Array.isArray(profiles)) return profiles[0] ?? null;
  return profiles;
}

function groupPendingByRecipient(rows: PendingLeadNotificationRow[]) {
  const groups = new Map<string, RecipientDigest>();

  for (const row of rows) {
    const profile = normalizeProfile(row.profiles);
    const existing = groups.get(row.recipient_id);
    if (existing) {
      existing.notificationIds.push(row.id);
      continue;
    }

    groups.set(row.recipient_id, {
      notificationIds: [row.id],
      email: profile?.email?.trim() ?? "",
      fullName: profile?.full_name?.trim() ?? "",
    });
  }

  return groups;
}

export async function processPendingLeadEmails(batchLimit = 500) {
  const service = createServiceClient();
  let processed = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  while (true) {
    const { data: pending, error } = await service
      .from("customer_notifications")
      .select("id, recipient_id, profiles:recipient_id(email, full_name)")
      .eq("type", "lead_received")
      .is("email_sent_at", null)
      .order("created_at", { ascending: true })
      .limit(batchLimit);

    if (error) {
      return { processed, sent, skipped, failed, error: error.message };
    }

    if (!pending?.length) break;

    const groups = groupPendingByRecipient(pending as PendingLeadNotificationRow[]);
    const sentAt = new Date().toISOString();

    for (const group of groups.values()) {
      const result = await sendNewLeadsDigestEmail({
        to: group.email,
        recipientName: group.fullName,
        leadCount: group.notificationIds.length,
      });

      if (result.ok) {
        await service
          .from("customer_notifications")
          .update({ email_sent_at: sentAt })
          .in("id", group.notificationIds);
        sent += 1;
        continue;
      }

      if (result.skipped) {
        skipped += 1;
        continue;
      }

      failed += 1;
    }

    processed += pending.length;
    if (pending.length < batchLimit) break;
  }

  return {
    processed,
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
