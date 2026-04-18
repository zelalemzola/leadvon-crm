import { ClientSetupForm } from "@/components/client/client-setup-form";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Customer setup · LeadVon",
};

export default async function ClientSetupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_active) redirect("/login?error=forbidden");
  if (profile.organization_id) redirect("/client");

  return (
    <div className="flex flex-1 items-center justify-center p-6 lg:p-8">
      <ClientSetupForm />
    </div>
  );
}
