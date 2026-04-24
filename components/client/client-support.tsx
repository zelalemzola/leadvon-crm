"use client";

import type { ComponentType } from "react";
import { useGetSupportContactsQuery } from "@/lib/api/client-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Phone, MessageSquareText } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";

export function ClientSupport() {
  const { t } = useI18n();
  const { data: contacts, isLoading } = useGetSupportContactsQuery();

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("client.support.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("client.support.subtitle")}
        </p>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("client.support.loading")}</p>
      ) : (contacts ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("client.support.empty")}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {(contacts ?? []).map((c) => (
            <ContactCard
              key={c.id}
              icon={pickIcon(c)}
              title={c.title}
              value={c.email || c.phone || t("client.support.noValue")}
              description={c.description || t("client.support.noValue")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function pickIcon(c: { email: string | null; phone: string | null; title: string }) {
  if (c.phone && !c.email) return Phone;
  if (c.email && /ops|sales/i.test(c.title)) return MessageSquareText;
  return Mail;
}

function ContactCard({
  icon: Icon,
  title,
  value,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  value: string;
  description: string;
}) {
  return (
    <Card className="border-border/70 bg-card/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="font-medium">{value}</p>
      </CardContent>
    </Card>
  );
}
