"use client";

import { useEffect } from "react";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";

export function AdminShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("admin-surface");
    return () => {
      root.classList.remove("admin-surface");
    };
  }, []);

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider defaultOpen={false} className="admin-surface min-h-svh">
        <AdminSidebar />
        <SidebarInset className="min-h-svh bg-background">
          <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b border-border/50 bg-background/90 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-1 h-4" />
            <span className="text-xs font-medium tracking-wide text-muted-foreground">
              Admin
            </span>
          </header>
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
