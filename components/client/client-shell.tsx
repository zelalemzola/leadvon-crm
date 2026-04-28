"use client";

import { ClientSidebar } from "@/components/client/client-sidebar";
import { ClientOnboardingTour } from "@/components/client/client-onboarding-tour";

export function ClientShell({ children }: { children: React.ReactNode }) {
  return (
    <ClientOnboardingTour>
      <div className="flex min-h-screen bg-background">
        <ClientSidebar />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </ClientOnboardingTour>
  );
}
