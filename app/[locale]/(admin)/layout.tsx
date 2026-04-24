import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/admin-shell";
import { isLocale } from "@/lib/i18n/messages";

export default async function AdminSegmentLayout({
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

  if (!user) {
    redirect(`/${safeLocale}/login`);
  }

  const profileRes = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  const profile =
    profileRes.error && profileRes.error.message.includes("is_active")
      ? (
          await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle()
        ).data
      : profileRes.data;

  const isInactive =
    typeof profile === "object" &&
    profile !== null &&
    "is_active" in profile &&
    (profile as { is_active?: boolean }).is_active === false;

  if (profile?.role !== "staff" || isInactive) {
    redirect(`/${safeLocale}/login?error=forbidden`);
  }

  return <AdminShell>{children}</AdminShell>;
}
