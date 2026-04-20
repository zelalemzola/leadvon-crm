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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useGetClientMeQuery } from "@/lib/api/client-api";

const baseNav = [
  { href: "/client", label: "Dashboard", icon: LayoutDashboard },
  { href: "/client/leads", label: "Leads", icon: Users },
  { href: "/client/billing", label: "Billing", icon: CreditCard },
  { href: "/client/activity", label: "Activity", icon: ScrollText },
  { href: "/client/support", label: "Support", icon: LifeBuoy },
  { href: "/client/settings", label: "Settings", icon: Settings },
];

export function ClientSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me } = useGetClientMeQuery();
  const nav = me?.role === "customer_agent"
    ? [...baseNav.slice(0, 2), { href: "/client/assigned", label: "Assigned", icon: Users }, ...baseNav.slice(2)]
    : baseNav;

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
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
            Client Portal
          </p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === "/client" ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              )}
            >
              <Icon className="size-4 opacity-80" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border/60 p-3">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={() => void signOut()}
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
