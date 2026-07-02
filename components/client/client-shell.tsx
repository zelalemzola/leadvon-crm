"use client";

import { ClientSidebar } from "@/components/client/client-sidebar";
import { ClientOnboardingTour } from "@/components/client/client-onboarding-tour";
import { WebPushOnSignIn } from "@/components/client/web-push-on-sign-in";

export function ClientShell({ children }: { children: React.ReactNode }) {
  return (
    <ClientOnboardingTour>
      <WebPushOnSignIn />
      <div className="flex min-h-screen bg-background">
        <ClientSidebar />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </ClientOnboardingTour>
  );
}
