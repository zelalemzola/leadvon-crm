"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Zap,
  Package,
  UserCog,
  LogOut,
  LifeBuoy,
  Contact,
  BarChart3,
  Activity,
  DollarSign,
  Landmark,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/providers/i18n-provider";

const nav = [
  { href: "/admin", key: "admin.nav.dashboard", icon: LayoutDashboard },
  { href: "/admin/overview", key: "admin.nav.clientOverview", icon: BarChart3 },
  { href: "/admin/distribution", key: "admin.nav.distribution", icon: Activity },
  { href: "/admin/margins", key: "admin.nav.margins", icon: DollarSign },
  { href: "/admin/finance", key: "admin.nav.finance", icon: Landmark },
  { href: "/admin/leads", key: "admin.nav.leads", icon: Users },
  { href: "/admin/customers", key: "admin.nav.customers", icon: Contact },
  { href: "/admin/pricing", key: "admin.nav.pricing", icon: Package },
  { href: "/admin/support", key: "admin.nav.support", icon: LifeBuoy },
  { href: "/admin/staff", key: "admin.nav.staff", icon: UserCog },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { t, locale, localizePath } = useI18n();
  const normalizedPath = pathname.replace(/^\/(en|fr)(?=\/|$)/, "") || "/";

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(localizePath("/login"));
    router.refresh();
  }

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border bg-card/40">
      <div className="flex items-center gap-2 border-b border-border px-4 py-5">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Zap className="size-5" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight">LeadVon</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("admin.shell.subtitle")}
          </p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {nav.map(({ href, key, icon: Icon }) => {
          const active =
            href === "/admin"
              ? normalizedPath === "/admin"
              : normalizedPath.startsWith(href);
          return (
            <Link
              key={href}
              href={`/${locale}${href}`}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
              {t(key)}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3">
        <LanguageSwitcher />
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={() => void signOut()}
        >
          <LogOut className="size-4" aria-hidden />
          {t("common.signOut")}
        </Button>
      </div>
    </aside>
  );
}
