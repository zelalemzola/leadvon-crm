export type PushSubscriptionPayload = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export function isWebPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function subscriptionToPayload(subscription: PushSubscription): PushSubscriptionPayload {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Invalid push subscription");
  }
  return {
    endpoint: json.endpoint,
    keys: {
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
  };
}

export async function registerServiceWorker() {
  if (!isWebPushSupported()) return null;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function subscribeToWebPush(vapidPublicKey: string) {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false as const, reason: permission };
  }

  const registration = await registerServiceWorker();
  if (!registration) {
    return { ok: false as const, reason: "unsupported" as const };
  }

  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  return { ok: true as const, subscription };
}

export async function unsubscribeFromWebPush() {
  if (!isWebPushSupported()) return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return true;
  return subscription.unsubscribe();
}

export async function getCurrentPushSubscription() {
  if (!isWebPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export const PUSH_PROMPT_SESSION_PREFIX = "leadvon.push.prompted";

export function clearPushPromptSession(userId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(`${PUSH_PROMPT_SESSION_PREFIX}.${userId}`);
}

export async function persistPushSubscription(subscription: PushSubscription) {
  const payload = subscriptionToPayload(subscription);
  const res = await fetch("/api/client/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? "Subscribe failed");
  }
}

export async function ensureWebPushSubscription(vapidPublicKey: string) {
  if (!isWebPushSupported()) {
    return { ok: false as const, reason: "unsupported" as const };
  }

  await registerServiceWorker();
  await navigator.serviceWorker.ready;

  const existing = await getCurrentPushSubscription();
  if (existing) {
    await persistPushSubscription(existing);
    return { ok: true as const, subscription: existing };
  }

  if (Notification.permission === "denied") {
    return { ok: false as const, reason: "denied" as const };
  }

  const result = await subscribeToWebPush(vapidPublicKey);
  if (!result.ok) return result;

  await persistPushSubscription(result.subscription);
  return result;
}
