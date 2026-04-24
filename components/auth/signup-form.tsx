"use client";

import { useState } from "react";
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

export function SignupForm() {
  const router = useRouter();
  const { t, localizePath } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          organization_name: organizationName,
          phone,
        },
      },
    });
    if (signUpError) {
      setLoading(false);
      setError(signUpError.message);
      return;
    }

    // Sign in directly for local-dev flow where email confirmation is disabled.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (signInError) {
      setError(
        t("auth.signup.confirmLater")
      );
      return;
    }
    router.push(localizePath("/client/setup"));
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md border-border/80 bg-card/60 shadow-lg">
      <CardHeader className="space-y-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Zap className="size-7" aria-hidden />
        </div>
        <div>
          <CardTitle className="text-xl">{t("auth.signup.title")}</CardTitle>
          <CardDescription>{t("auth.signup.subtitle")}</CardDescription>
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
            <Label htmlFor="full_name">{t("auth.signup.fullName")}</Label>
            <Input
              id="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.login.email")}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="organization_name">{t("auth.signup.organizationName")}</Label>
            <Input
              id="organization_name"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="Acme Insurance LLC"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">{t("auth.signup.phone")}</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 010 2233"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.signup.password")}</Label>
            <Input
              id="password"
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("auth.signup.creating") : t("auth.signup.createAccount")}
          </Button>
        </form>
        <p className="mt-5 text-center text-xs text-muted-foreground">
          {t("auth.signup.alreadyHaveAccount")}{" "}
          <Link href={localizePath("/login")} className="font-medium text-primary underline underline-offset-2">
            {t("auth.signup.signIn")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
