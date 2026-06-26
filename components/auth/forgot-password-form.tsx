"use client";

import { useState } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useI18n } from "@/components/providers/i18n-provider";
import { getAppBaseUrl } from "@/lib/email/resend";

export function ForgotPasswordForm() {
  const { t, locale, localizePath } = useI18n();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const baseUrl = typeof window !== "undefined" ? window.location.origin : getAppBaseUrl();
    const redirectTo = `${baseUrl}/${locale}/auth/callback?next=/${locale}/reset-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  return (
    <Card className="w-full max-w-md border-border/80 bg-card/60 shadow-lg">
      <CardHeader className="space-y-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Zap className="size-7" aria-hidden />
        </div>
        <div>
          <CardTitle className="text-xl">{t("auth.forgotPassword.title")}</CardTitle>
          <CardDescription>{t("auth.forgotPassword.subtitle")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="space-y-4 text-center">
            <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground">
              {t("auth.forgotPassword.sent")}
            </p>
            <Link
              href={localizePath("/login")}
              className="text-sm font-medium text-primary underline underline-offset-2"
            >
              {t("auth.forgotPassword.backToSignIn")}
            </Link>
          </div>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
            {error ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.login.email")}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth.login.placeholderEmail")}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("auth.forgotPassword.sending") : t("auth.forgotPassword.sendLink")}
            </Button>
          </form>
        )}
        {!sent ? (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link
              href={localizePath("/login")}
              className="font-medium text-primary underline underline-offset-2"
            >
              {t("auth.forgotPassword.backToSignIn")}
            </Link>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
