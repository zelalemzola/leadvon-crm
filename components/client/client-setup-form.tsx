"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export function ClientSetupForm() {
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const md = user?.user_metadata as Record<string, unknown> | undefined;
      if (typeof md?.organization_name === "string") {
        setOrganizationName(md.organization_name);
      }
      if (typeof md?.phone === "string") {
        setPhone(md.phone);
      }
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/client/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization_name: organizationName, phone }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setLoading(false);
    if (!res.ok) {
      toast.error(json.error ?? "Could not complete setup");
      return;
    }
    toast.success("Workspace ready");
    router.push("/client");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-lg border-border/80 bg-card/60 shadow-lg">
      <CardHeader>
        <CardTitle>Set up your customer workspace</CardTitle>
        <CardDescription>
          Choose your company/organization name to start managing purchased leads.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Organization name</Label>
            <Input
              id="org-name"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="Acme Insurance LLC"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 010 2233"
              required
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Continue to dashboard"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
