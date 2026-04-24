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

export function SetupForm() {
  const router = useRouter();
  const { t, localizePath } = useI18n();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const res = await fetch("/api/auth/bootstrap");
        const data = (await res.json()) as {
          allowed?: boolean;
          reason?: string;
          message?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setAllowed(false);
          setReason(t("auth.setup.checkFailed"));
          return;
        }
        if (data.reason === "missing_service_key") {
          setAllowed(false);
          setReason(
            t("auth.setup.missingServiceKey")
          );
          return;
        }
        if (data.reason === "database" && data.message) {
          setAllowed(false);
          setReason(data.message);
          return;
        }
        setAllowed(Boolean(data.allowed));
        if (!data.allowed) {
          setReason(
            t("auth.setup.staffExists")
          );
        }
      } catch {
        if (!cancelled) {
          setAllowed(false);
          setReason(t("auth.setup.networkError"));
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t("auth.setup.passwordMismatch"));
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        full_name: fullName || undefined,
      }),
    });
    const json = (await res.json()) as { error?: string; ok?: boolean };
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? t("auth.setup.setupFailed"));
      return;
    }
    const supabase = createClient();
    const { error: signError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signError) {
      setError(
        `${t("auth.setup.createdSignInManually")} ${signError.message}`
      );
      router.push(localizePath("/login"));
      return;
    }
    router.push(localizePath("/admin"));
    router.refresh();
  }

  if (checking) {
    return (
      <Card className="w-full max-w-md border-border/80 bg-card/60 shadow-lg">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {t("auth.setup.checking")}
        </CardContent>
      </Card>
    );
  }

  if (!allowed) {
    return (
      <Card className="w-full max-w-md border-border/80 bg-card/60 shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{t("auth.setup.unavailableTitle")}</CardTitle>
          <CardDescription>{reason}</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Button asChild variant="outline">
            <Link href={localizePath("/login")}>{t("auth.setup.backToSignIn")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md border-border/80 bg-card/60 shadow-lg">
      <CardHeader className="space-y-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Zap className="size-7" aria-hidden />
        </div>
        <div>
          <CardTitle className="text-xl">{t("auth.setup.title")}</CardTitle>
          <CardDescription>
            {t("auth.setup.subtitle")}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="setup-email">{t("auth.setup.workEmail")}</Label>
            <Input
              id="setup-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-name">{t("auth.setup.fullNameOptional")}</Label>
            <Input
              id="setup-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-pass">{t("auth.login.password")}</Label>
            <Input
              id="setup-pass"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-confirm">{t("auth.setup.confirmPassword")}</Label>
            <Input
              id="setup-confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("auth.setup.creating") : t("auth.setup.createContinue")}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          <Link href={localizePath("/login")} className="underline underline-offset-2">
            {t("auth.setup.alreadyHaveAccountSignIn")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
