import { ClientSetupForm } from "@/components/client/client-setup-form";
import { createClient } from "@/lib/supabase/server";
import { isLocale } from "@/lib/i18n/messages";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Customer setup · LeadVon",
};

export default async function ClientSetupPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = isLocale(locale) ? locale : "en";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${safeLocale}/login`);
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_active) redirect(`/${safeLocale}/login?error=forbidden`);
  if (profile.organization_id) redirect(`/${safeLocale}/client`);

  return (
    <div className="flex flex-1 items-center justify-center p-6 lg:p-8">
      <ClientSetupForm />
    </div>
  );
}
