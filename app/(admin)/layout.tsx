import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function AdminSegmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
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
    redirect("/login?error=forbidden");
  }

  return <AdminShell>{children}</AdminShell>;
}
