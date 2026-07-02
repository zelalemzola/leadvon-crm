"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/components/providers/i18n-provider";
import {
  getCurrentPushSubscription,
  isWebPushSupported,
  unsubscribeFromWebPush,
} from "@/lib/push/client";

type PushState = "loading" | "unsupported" | "blocked" | "default" | "enabled";

export function PushNotificationsPrompt() {
  const { t } = useI18n();
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";

  const refreshState = useCallback(async () => {
    if (!isWebPushSupported() || !vapidPublicKey) {
      setState("unsupported");
      return;
    }

    const permission = Notification.permission;
    if (permission === "denied") {
      setState("blocked");
      return;
    }

    const subscription = await getCurrentPushSubscription();
    if (subscription) {
      setState("enabled");
      return;
    }

    setState("default");
  }, [vapidPublicKey]);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  async function disablePush() {
    setBusy(true);
    try {
      const subscription = await getCurrentPushSubscription();
      const endpoint = subscription?.endpoint;
      await unsubscribeFromWebPush();

      const url = endpoint
        ? `/api/client/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`
        : "/api/client/push/subscribe";
      await fetch(url, { method: "DELETE" });

      setState(Notification.permission === "denied" ? "blocked" : "default");
      toast.success(t("clientNotifications.pushDisabled"));
    } catch {
      toast.error(t("clientNotifications.pushDisableFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return (
      <Card className="border-border/70 bg-card/50">
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("clientNotifications.pushLoading")}
        </CardContent>
      </Card>
    );
  }

  if (state === "unsupported") {
    return (
      <Card className="border-border/70 bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BellOff className="size-4 text-muted-foreground" />
            {t("clientNotifications.pushTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("clientNotifications.pushUnsupported")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 bg-card/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="size-4 text-primary" />
          {t("clientNotifications.pushTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {state === "enabled"
            ? t("clientNotifications.pushEnabledDescription")
            : state === "blocked"
              ? t("clientNotifications.pushBlockedDescription")
              : t("clientNotifications.pushSignInDescription")}
        </p>
        {state === "enabled" ? (
          <Button variant="outline" disabled={busy} onClick={() => void disablePush()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : t("clientNotifications.pushDisable")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
