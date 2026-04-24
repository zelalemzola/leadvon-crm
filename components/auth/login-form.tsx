"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

export function LoginForm({
  initialError,
}: {
  initialError?: string;
}) {
  const router = useRouter();
  const { t, localizePath } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError === "forbidden"
      ? t("auth.login.forbidden")
      : initialError
        ? t("auth.login.failed")
        : null
  );
  const [setupAvailable, setSetupAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch("/api/auth/bootstrap");
        const data = (await res.json()) as { allowed?: boolean };
        if (!cancelled && res.ok && data.allowed) {
          setSetupAvailable(true);
        }
      } catch {
        /* ignore */
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: signError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (signError) {
      setError(signError.message);
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError(t("auth.login.profileLoadError"));
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active, organization_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.is_active) {
      setError(t("auth.login.inactive"));
      await supabase.auth.signOut();
      return;
    }
    if (profile.role === "staff") {
      router.push(localizePath("/admin"));
    } else if (
      profile.role === "customer_admin" ||
      profile.role === "customer_agent"
    ) {
      const hasOrg =
        typeof profile === "object" &&
        profile !== null &&
        "organization_id" in profile &&
        Boolean((profile as { organization_id?: string | null }).organization_id);
      router.push(hasOrg ? localizePath("/client") : localizePath("/client/setup"));
    } else {
      setError(t("auth.login.unknownRole"));
      await supabase.auth.signOut();
      return;
    }
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md border-border/80 bg-card/60 shadow-lg">
      <CardHeader className="space-y-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Zap className="size-7" aria-hidden />
        </div>
        <div>
          <CardTitle className="text-xl">LeadVon</CardTitle>
          <CardDescription>{t("auth.login.subtitle")}</CardDescription>
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
          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.login.password")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("auth.login.signingIn") : t("auth.login.signIn")}
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {setupAvailable ? (
            <>
              {t("auth.login.firstTime")}{" "}
              <Link
                href={localizePath("/setup")}
                className="font-medium text-primary underline underline-offset-2"
              >
                {t("auth.login.createFirstAdmin")}
              </Link>
              {" · "}
            </>
          ) : null}
          <Link href={localizePath("/signup")} className="font-medium text-primary underline underline-offset-2">
            {t("auth.login.customerSignUp")}
          </Link>
          {" · "}
          <Link href={localizePath("/")} className="underline underline-offset-2">
            {t("auth.login.home")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
