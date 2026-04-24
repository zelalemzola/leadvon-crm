"use client";

import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/providers/i18n-provider";
import { type Locale } from "@/lib/i18n/messages";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  function toggle() {
    const next: Locale = locale === "en" ? "fr" : "en";
    setLocale(next);
  }

  return (
    <Button
      variant="ghost"
      className="w-full justify-start gap-2 text-muted-foreground"
      onClick={toggle}
      title={t("common.language")}
    >
      <Languages className="size-4" aria-hidden />
      {t("common.language")}: {locale === "en" ? t("common.english") : t("common.french")}
    </Button>
  );
}
