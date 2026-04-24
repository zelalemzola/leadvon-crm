import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClientShell } from "@/components/client/client-shell";
import { isLocale } from "@/lib/i18n/messages";

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
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
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role ?? "";
  const isCustomer = role === "customer_admin" || role === "customer_agent";
  const isInactive =
    typeof profile === "object" &&
    profile !== null &&
    "is_active" in profile &&
    (profile as { is_active?: boolean }).is_active === false;

  if (!isCustomer || isInactive) redirect(`/${safeLocale}/login?error=forbidden`);

  return <ClientShell>{children}</ClientShell>;
}
