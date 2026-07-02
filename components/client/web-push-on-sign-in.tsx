"use client";

import { useEffect, useRef } from "react";
import { useGetClientMeQuery } from "@/lib/api/client-api";
import {
  ensureWebPushSubscription,
  isWebPushSupported,
  PUSH_PROMPT_SESSION_PREFIX,
} from "@/lib/push/client";

const PROMPT_DELAY_MS = 1500;

export function WebPushOnSignIn() {
  const { data: me } = useGetClientMeQuery();
  const attemptedRef = useRef(false);

  useEffect(() => {
    const userId = me?.id;
    if (!userId || attemptedRef.current) return;

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
    if (!vapidPublicKey || !isWebPushSupported()) return;

    const sessionKey = `${PUSH_PROMPT_SESSION_PREFIX}.${userId}`;
    if (localStorage.getItem(sessionKey)) return;

    attemptedRef.current = true;

    const timer = window.setTimeout(() => {
      localStorage.setItem(sessionKey, "1");
      void ensureWebPushSubscription(vapidPublicKey).catch(() => undefined);
    }, PROMPT_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [me?.id]);

  return null;
}
