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

export function SetupForm() {
  const router = useRouter();
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
          setReason("Could not check setup status.");
          return;
        }
        if (data.reason === "missing_service_key") {
          setAllowed(false);
          setReason(
            "Add SUPABASE_SERVICE_ROLE_KEY to .env.local (server only), then restart the dev server."
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
            "A staff account already exists. Sign in at the login page, or add more users from Admin → Staff."
          );
        }
      } catch {
        if (!cancelled) {
          setAllowed(false);
          setReason("Network error while checking setup.");
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
      setError("Passwords do not match.");
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
      setError(json.error ?? "Setup failed.");
      return;
    }
    const supabase = createClient();
    const { error: signError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signError) {
      setError(
        `Account created. Sign in manually: ${signError.message}`
      );
      router.push("/login");
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  if (checking) {
    return (
      <Card className="w-full max-w-md border-border/80 bg-card/60 shadow-lg">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Checking setup…
        </CardContent>
      </Card>
    );
  }

  if (!allowed) {
    return (
      <Card className="w-full max-w-md border-border/80 bg-card/60 shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Setup unavailable</CardTitle>
          <CardDescription>{reason}</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Button asChild variant="outline">
            <Link href="/login">Back to sign in</Link>
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
          <CardTitle className="text-xl">Create first admin</CardTitle>
          <CardDescription>
            One-time setup. Choose the email and password you will use to sign
            in.
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
            <Label htmlFor="setup-email">Work email</Label>
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
            <Label htmlFor="setup-name">Full name (optional)</Label>
            <Input
              id="setup-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-pass">Password</Label>
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
            <Label htmlFor="setup-confirm">Confirm password</Label>
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
            {loading ? "Creating…" : "Create admin & continue"}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          <Link href="/login" className="underline underline-offset-2">
            Already have an account? Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
