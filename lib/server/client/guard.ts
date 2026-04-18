import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireCustomerOrg() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active, organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_active) redirect("/login?error=forbidden");
  if (profile.role !== "customer_admin" && profile.role !== "customer_agent") {
    redirect("/login?error=forbidden");
  }
  if (!profile.organization_id) redirect("/client/setup");
}
