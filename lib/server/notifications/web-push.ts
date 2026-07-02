import webpush from "web-push";
import { getAppBaseUrl } from "@/lib/email/resend";
import { createServiceClient } from "@/lib/supabase/service";

export type WebPushPayload = {
  title: string;
  body: string;
  url?: string;
  notificationId?: string;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

let vapidConfigured = false;

function configureVapid() {
  if (vapidConfigured) return true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject =
    process.env.VAPID_SUBJECT?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "mailto:support@leadvoncrm.com";

  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export function isWebPushConfigured() {
  return configureVapid();
}

function notificationUrl(notificationId?: string) {
  const base = getAppBaseUrl().replace(/\/$/, "");
  const path = `/en/client/notifications`;
  if (!notificationId) return `${base}${path}`;
  return `${base}${path}?id=${encodeURIComponent(notificationId)}`;
}

export async function sendPushToUser(userId: string, payload: WebPushPayload) {
  if (!configureVapid()) {
    return { sent: 0, failed: 0, skipped: true as const };
  }

  const service = createServiceClient();
  const { data: subscriptions, error } = await service
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error) {
    return { sent: 0, failed: 0, skipped: false as const, error: error.message };
  }

  if (!subscriptions?.length) {
    return { sent: 0, failed: 0, skipped: false as const };
  }

  const pushBody = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? notificationUrl(payload.notificationId),
    notificationId: payload.notificationId ?? null,
  });

  let sent = 0;
  let failed = 0;

  for (const subscription of subscriptions as PushSubscriptionRow[]) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        pushBody
      );
      sent += 1;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await service.from("push_subscriptions").delete().eq("id", subscription.id);
      }
      failed += 1;
    }
  }

  return { sent, failed, skipped: false as const };
}

export async function sendPushForNotification(input: {
  id: string;
  recipient_id: string;
  title: string;
  body: string;
}) {
  return sendPushToUser(input.recipient_id, {
    title: input.title,
    body: input.body,
    notificationId: input.id,
  });
}
