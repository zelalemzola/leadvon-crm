"use client";

import { ClientSidebar } from "@/components/client/client-sidebar";
import { ClientOnboardingTour } from "@/components/client/client-onboarding-tour";
import { WebPushOnSignIn } from "@/components/client/web-push-on-sign-in";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";

export function ClientShell({ children }: { children: React.ReactNode }) {
  return (
    <ClientOnboardingTour>
      <WebPushOnSignIn />
      <TooltipProvider delayDuration={0}>
        <SidebarProvider defaultOpen={false} className="min-h-svh">
          <ClientSidebar />
          <SidebarInset className="min-h-svh bg-background">
            <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b border-border/60 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-1 h-4" />
              <span className="text-xs text-muted-foreground">Client</span>
            </header>
            <div className="flex min-w-0 flex-1 flex-col">{children}</div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </ClientOnboardingTour>
  );
}
