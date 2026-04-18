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

export function LoginForm({
  initialError,
}: {
  initialError?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError === "forbidden"
      ? "You do not have access to this console."
      : initialError
        ? "Sign in failed."
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
      setError("Unable to load profile.");
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active, organization_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.is_active) {
      setError("Your account is inactive. Contact your administrator.");
      await supabase.auth.signOut();
      return;
    }
    if (profile.role === "staff") {
      router.push("/admin");
    } else if (
      profile.role === "customer_admin" ||
      profile.role === "customer_agent"
    ) {
      const hasOrg =
        typeof profile === "object" &&
        profile !== null &&
        "organization_id" in profile &&
        Boolean((profile as { organization_id?: string | null }).organization_id);
      router.push(hasOrg ? "/client" : "/client/setup");
    } else {
      setError("Your account role is not recognized.");
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
          <CardDescription>Sign in to your workspace</CardDescription>
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
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
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
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {setupAvailable ? (
            <>
              First time here?{" "}
              <Link
                href="/setup"
                className="font-medium text-primary underline underline-offset-2"
              >
                Create the first admin account
              </Link>
              {" · "}
            </>
          ) : null}
          <Link href="/signup" className="font-medium text-primary underline underline-offset-2">
            Customer sign up
          </Link>
          {" · "}
          <Link href="/" className="underline underline-offset-2">
            Home
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
