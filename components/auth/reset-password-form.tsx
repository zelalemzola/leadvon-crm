"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

export function ResetPasswordForm() {
  const router = useRouter();
  const { t, localizePath } = useI18n();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!cancelled) {
        setHasSession(Boolean(user));
        setCheckingSession(false);
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError(t("auth.resetPassword.passwordTooShort"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth.resetPassword.passwordMismatch"));
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.push(localizePath("/login"));
      router.refresh();
    }, 1500);
  }

  return (
    <Card className="w-full max-w-md border-border/80 bg-card/60 shadow-lg">
      <CardHeader className="space-y-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Zap className="size-7" aria-hidden />
        </div>
        <div>
          <CardTitle className="text-xl">{t("auth.resetPassword.title")}</CardTitle>
          <CardDescription>{t("auth.resetPassword.subtitle")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {checkingSession ? (
          <p className="text-center text-sm text-muted-foreground">{t("auth.resetPassword.checking")}</p>
        ) : !hasSession ? (
          <div className="space-y-4 text-center">
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {t("auth.resetPassword.invalidLink")}
            </p>
            <Link
              href={localizePath("/forgot-password")}
              className="text-sm font-medium text-primary underline underline-offset-2"
            >
              {t("auth.resetPassword.requestNewLink")}
            </Link>
          </div>
        ) : done ? (
          <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-center text-sm text-foreground">
            {t("auth.resetPassword.success")}
          </p>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
            {error ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.resetPassword.newPassword")}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">{t("auth.resetPassword.confirmPassword")}</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("auth.resetPassword.updating") : t("auth.resetPassword.updatePassword")}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
