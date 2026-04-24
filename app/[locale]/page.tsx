import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isLocale } from "@/lib/i18n/messages";

export default async function Home({
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

  if (!user) {
    redirect(`/${safeLocale}/login`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active, organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_active) {
    redirect(`/${safeLocale}/login?error=forbidden`);
  }

  if (profile.role === "staff") {
    redirect(`/${safeLocale}/admin`);
  }

  if (profile.role === "customer_admin" || profile.role === "customer_agent") {
    const hasOrg =
      typeof profile === "object" &&
      profile !== null &&
      "organization_id" in profile &&
      Boolean((profile as { organization_id?: string | null }).organization_id);
    redirect(hasOrg ? `/${safeLocale}/client` : `/${safeLocale}/client/setup`);
  }

  redirect(`/${safeLocale}/login?error=forbidden`);
}
