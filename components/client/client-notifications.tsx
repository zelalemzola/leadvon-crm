"use client";

import { useMemo } from "react";
import { Bell, CheckCheck, Flame, PhoneCall, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  useGetNotificationsQuery,
  useMarkNotificationsReadMutation,
} from "@/lib/api/client-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/providers/i18n-provider";
import { PushNotificationsPrompt } from "@/components/client/push-notifications-prompt";

function notificationIcon(type: string) {
  if (type === "lead_assigned") return UserRound;
  if (type === "lead_status_changed") return PhoneCall;
  return Flame;
}

export function ClientNotifications() {
  const { t } = useI18n();
  const { data, isLoading, isError } = useGetNotificationsQuery(undefined, {
    pollingInterval: 60_000,
  });
  const [markRead, { isLoading: marking }] = useMarkNotificationsReadMutation();

  const rows = data?.rows ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const grouped = useMemo(() => rows, [rows]);

  async function markAllRead() {
    try {
      await markRead({ mark_all_read: true }).unwrap();
      toast.success(t("clientNotifications.markedAllRead"));
    } catch {
      toast.error(t("clientNotifications.markReadFailed"));
    }
  }

  async function markOneRead(id: string) {
    try {
      await markRead({ ids: [id] }).unwrap();
    } catch {
      toast.error(t("clientNotifications.markReadFailed"));
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("clientNotifications.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("clientNotifications.subtitle")}</p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          disabled={unreadCount === 0 || marking}
          onClick={() => void markAllRead()}
        >
          <CheckCheck className="size-4" />
          {t("clientNotifications.markAllRead")}
        </Button>
      </header>

      <PushNotificationsPrompt />

      <Card className="border-border/70 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="size-4 text-primary" />
            {t("clientNotifications.inbox")}
            {unreadCount > 0 ? (
              <Badge className="bg-primary/15 text-primary">{unreadCount}</Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("clientNotifications.loading")}</p>
          ) : isError ? (
            <p className="text-sm text-destructive">{t("clientNotifications.failed")}</p>
          ) : grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("clientNotifications.empty")}</p>
          ) : (
            grouped.map((item) => {
              const Icon = notificationIcon(item.type);
              const unread = !item.read_at;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (unread) void markOneRead(item.id);
                  }}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                    unread
                      ? "border-primary/30 bg-primary/5 hover:bg-primary/10"
                      : "border-border/70 bg-background/40 hover:bg-muted/20"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg bg-muted/40 p-2">
                      <Icon className="size-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{item.title}</p>
                        {unread ? (
                          <Badge variant="outline" className="text-[10px]">
                            {t("clientNotifications.unread")}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
