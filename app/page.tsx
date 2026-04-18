import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active, organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_active) {
    redirect("/login?error=forbidden");
  }

  if (profile.role === "staff") {
    redirect("/admin");
  }

  if (profile.role === "customer_admin" || profile.role === "customer_agent") {
    const hasOrg =
      typeof profile === "object" &&
      profile !== null &&
      "organization_id" in profile &&
      Boolean((profile as { organization_id?: string | null }).organization_id);
    redirect(hasOrg ? "/client" : "/client/setup");
  }

  redirect("/login?error=forbidden");
}
