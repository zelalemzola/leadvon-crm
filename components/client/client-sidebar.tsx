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
  Compass,
  Bell,
  BarChart3,
  MessageSquare,
  FileText,
  Megaphone,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { clearPushPromptSession } from "@/lib/push/client";
import { useGetClientMeQuery, useGetNotificationsQuery, clientApi } from "@/lib/api/client-api";
import { useI18n } from "@/components/providers/i18n-provider";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { useNextStep } from "nextstepjs";
import { useAppDispatch } from "@/lib/hooks";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";

const baseNav = [
  { href: "/client", key: "client.nav.dashboard", icon: LayoutDashboard },
  { href: "/client/leads", key: "client.nav.leads", icon: Users },
  { href: "/client/call-scripts", key: "client.nav.callScripts", icon: FileText },
  { href: "/client/sms", key: "client.nav.sms", icon: MessageSquare },
  { href: "/client/bulk-sms", key: "client.nav.bulkSms", icon: Megaphone },
  { href: "/client/notifications", key: "client.nav.notifications", icon: Bell },
  { href: "/client/billing", key: "client.nav.billing", icon: CreditCard },
  { href: "/client/activity", key: "client.nav.activity", icon: ScrollText },
  { href: "/client/support", key: "client.nav.support", icon: LifeBuoy },
];

function getNavTourId(href: string) {
  if (href === "/client") return "tour-client-nav-dashboard";
  return `tour-client-nav-${href.split("/").at(-1) ?? "item"}`;
}

export function ClientSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { data: me } = useGetClientMeQuery();
  const { data: notifications } = useGetNotificationsQuery(undefined, {
    pollingInterval: 60_000,
  });
  const unreadCount = notifications?.unreadCount ?? 0;
  const { t, locale, localizePath } = useI18n();
  const { startNextStep } = useNextStep();
  const normalizedPath = pathname.replace(/^\/(en|fr)(?=\/|$)/, "") || "/";
  const navCore =
    me?.role === "customer_agent"
      ? [
          ...baseNav.slice(0, 2),
          { href: "/client/assigned", key: "client.nav.assigned", icon: Users },
          ...baseNav.slice(2),
        ]
      : baseNav;
  const nav =
    me?.role === "customer_admin"
      ? [
          ...navCore,
          { href: "/client/agents", key: "client.nav.agents", icon: BarChart3 },
          { href: "/client/settings", key: "client.nav.settings", icon: Settings },
        ]
      : navCore;

  async function signOut() {
    const supabase = createClient();
    if (me?.id) clearPushPromptSession(me.id);
    dispatch(clientApi.util.resetApiState());
    await supabase.auth.signOut();
    router.push(localizePath("/login"));
    router.refresh();
  }

  function replayTour() {
    if (typeof window === "undefined") return;
    if (me?.id) {
      window.localStorage.removeItem(`leadvon.clientTour.completed.${me.id}`);
    }
    startNextStep("client-first-run");
  }

  return (
    <Sidebar
      id="tour-client-sidebar"
      collapsible="icon"
      variant="sidebar"
      className="border-r border-sidebar-border"
    >
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="LeadVon" asChild>
              <Link href={`/${locale}/client`}>
                <div className="flex size-8 items-center justify-center rounded-md border border-sidebar-border bg-sidebar-accent text-sidebar-primary">
                  <Zap className="size-4" aria-hidden />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">LeadVon</span>
                  <span className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t("client.shell.subtitle")}
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
                  href === "/client"
                    ? normalizedPath === href
                    : normalizedPath.startsWith(href);
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={t(key)}>
                      <Link id={getNavTourId(href)} href={`/${locale}${href}`}>
                        <Icon aria-hidden />
                        <span>{t(key)}</span>
                      </Link>
                    </SidebarMenuButton>
                    {href === "/client/notifications" && unreadCount > 0 ? (
                      <SidebarMenuBadge>
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </SidebarMenuBadge>
                    ) : null}
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
        <SidebarMenu className="group-data-[collapsible=icon]:hidden">
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={me?.full_name?.trim() || t("common.signedInUser")} disabled>
              <User aria-hidden />
              <span className="flex min-w-0 flex-col items-start">
                <span className="truncate text-xs font-medium">
                  {me?.full_name?.trim() || t("common.signedInUser")}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {me?.email ||
                    (me?.role ? me.role.replace("customer_", "") : t("common.account"))}
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarSeparator className="group-data-[collapsible=icon]:hidden" />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Replay tour" onClick={replayTour}>
              <Compass aria-hidden />
              <span>Replay tour</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
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
