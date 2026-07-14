"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  MessageSquare,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/components/providers/i18n-provider";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";

const nav = [
  { href: "/admin", key: "admin.nav.dashboard", icon: LayoutDashboard },
  { href: "/admin/overview", key: "admin.nav.clientOverview", icon: BarChart3 },
  { href: "/admin/distribution", key: "admin.nav.distribution", icon: Activity },
  { href: "/admin/margins", key: "admin.nav.margins", icon: DollarSign },
  { href: "/admin/finance", key: "admin.nav.finance", icon: Landmark },
  { href: "/admin/sms", key: "admin.nav.sms", icon: MessageSquare },
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
    <Sidebar collapsible="icon" variant="sidebar" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="LeadVon" asChild>
              <Link href={`/${locale}/admin`}>
                <div className="flex size-8 items-center justify-center rounded-md border border-sidebar-border bg-sidebar-accent">
                  <Zap className="size-4" aria-hidden />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">LeadVon</span>
                  <span className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t("admin.shell.subtitle")}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map(({ href, key, icon: Icon }) => {
                const active =
                  href === "/admin"
                    ? normalizedPath === "/admin"
                    : normalizedPath.startsWith(href);
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={t(key)}
                    >
                      <Link href={`/${locale}${href}`}>
                        <Icon aria-hidden />
                        <span>{t(key)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="group-data-[collapsible=icon]:hidden">
          <LanguageSwitcher />
        </div>
        <SidebarSeparator className="group-data-[collapsible=icon]:hidden" />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={t("common.signOut")}
              onClick={() => void signOut()}
            >
              <LogOut aria-hidden />
              <span>{t("common.signOut")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
