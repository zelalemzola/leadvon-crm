"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  LifeBuoy,
  Settings,
  LogOut,
  Zap,
  ScrollText,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useGetClientMeQuery } from "@/lib/api/client-api";
import { useI18n } from "@/components/providers/i18n-provider";
import { LanguageSwitcher } from "@/components/shared/language-switcher";

const baseNav = [
  { href: "/client", key: "client.nav.dashboard", icon: LayoutDashboard },
  { href: "/client/leads", key: "client.nav.leads", icon: Users },
  { href: "/client/billing", key: "client.nav.billing", icon: CreditCard },
  { href: "/client/activity", key: "client.nav.activity", icon: ScrollText },
  { href: "/client/support", key: "client.nav.support", icon: LifeBuoy },
  { href: "/client/settings", key: "client.nav.settings", icon: Settings },
];

export function ClientSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me } = useGetClientMeQuery();
  const { t, locale, localizePath } = useI18n();
  const normalizedPath = pathname.replace(/^\/(en|fr)(?=\/|$)/, "") || "/";
  const nav = me?.role === "customer_agent"
    ? [
        ...baseNav.slice(0, 2),
        { href: "/client/assigned", key: "client.nav.assigned", icon: Users },
        ...baseNav.slice(2),
      ]
    : baseNav;

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(localizePath("/login"));
    router.refresh();
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border/60 bg-card/40">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-5">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Zap className="size-5" />
        </div>
        <div>
          <p className="text-sm font-semibold">LeadVon</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("client.shell.subtitle")}
          </p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {nav.map(({ href, key, icon: Icon }) => {
          const active = href === "/client" ? normalizedPath === href : normalizedPath.startsWith(href);
          return (
            <Link
              key={href}
              href={`/${locale}${href}`}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              )}
            >
              <Icon className="size-4 opacity-80" />
              {t(key)}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border/60 p-3">
        <LanguageSwitcher />
        <Button
          variant="ghost"
          className="mb-1 h-auto w-full justify-start gap-2 px-2 py-2 text-left text-muted-foreground hover:bg-muted/40"
          disabled
        >
          <User className="size-4 shrink-0" />
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium text-foreground">
              {me?.full_name?.trim() || t("common.signedInUser")}
            </span>
            <span className="block truncate text-[11px]">
              {me?.email || (me?.role ? me.role.replace("customer_", "") : t("common.account"))}
            </span>
          </span>
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={() => void signOut()}
        >
          <LogOut className="size-4" />
          {t("common.signOut")}
        </Button>
      </div>
    </aside>
  );
}
