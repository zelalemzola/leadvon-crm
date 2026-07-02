"use client";

import { Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";

type SmsComingSoonProps = {
  variant?: "page" | "panel";
  className?: string;
};

export function SmsComingSoon({ variant = "page", className }: SmsComingSoonProps) {
  const { t } = useI18n();

  if (variant === "panel") {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed border-border/70 bg-muted/20 p-4 text-center",
          className
        )}
      >
        <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Clock className="size-5" />
        </div>
        <p className="text-sm font-medium">{t("smsComingSoon.title")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("smsComingSoon.inlineDescription")}</p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-1 items-center justify-center p-6 lg:p-8", className)}>
      <Card className="w-full max-w-lg border-border/70 bg-card/50 text-center">
        <CardHeader className="items-center">
          <div className="mb-2 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Clock className="size-7" />
          </div>
          <CardTitle className="text-xl">{t("smsComingSoon.title")}</CardTitle>
          <CardDescription className="text-base">{t("smsComingSoon.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("smsComingSoon.hint")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
