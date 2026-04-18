import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClientShell } from "@/components/client/client-shell";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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

  if (!isCustomer || isInactive) redirect("/login?error=forbidden");

  return <ClientShell>{children}</ClientShell>;
}
