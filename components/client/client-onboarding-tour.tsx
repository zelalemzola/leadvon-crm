"use client";

import { useEffect, useMemo, useRef } from "react";
import { NextStep, NextStepProvider, useNextStep, type CardComponentProps, type Step, type Tour } from "nextstepjs";
import { usePathname } from "next/navigation";
import { useGetClientMeQuery } from "@/lib/api/client-api";
import { isLocale } from "@/lib/i18n/messages";

const TOUR_NAME = "client-first-run";
const TOUR_KEY_PREFIX = "leadvon.clientTour.completed";

function getLocalePrefix(pathname: string) {
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  return isLocale(firstSegment) ? `/${firstSegment}` : "/en";
}

function buildTourSteps(localePrefix: string, role?: string): Tour[] {
  const isAdmin = role === "customer_admin";
  const agentSteps: Step[] = !isAdmin
    ? [
        {
          icon: "👤",
          title: "Your assigned queue",
          content:
            "As an agent, this page shows only leads assigned to you so your workflow stays focused.",
          selector: "#tour-client-nav-assigned",
          side: "right",
          nextRoute: `${localePrefix}/client/assigned`,
        },
        {
          icon: "🔎",
          title: "Filter your assigned leads",
          content:
            "Use search, status, unit type, and sorting to prioritize who to contact next.",
          selector: "#tour-client-assigned-filters",
          side: "bottom",
        },
        {
          icon: "✅",
          title: "Update and close work fast",
          content:
            "Open leads, update status/notes, and move through pages until your queue is clear.",
          selector: "#tour-client-assigned-table",
          side: "top",
        },
        {
          icon: "🏁",
          title: "You are ready",
          content:
            "You now know where to work your assigned leads, track progress, and get help when needed.",
          selector: "#tour-client-assigned-pagination",
          side: "top",
          showSkip: true,
        },
      ]
    : [];
  const adminSteps: Step[] = isAdmin
    ? [
        {
          icon: "👥",
          title: "Invite team members",
          content:
            "Customer admins can create users and assign them as admins or agents for your organization.",
          selector: "#tour-client-settings-create-user",
          side: "top",
        },
        {
          icon: "⚙️",
          title: "Team settings",
          content:
            "Manage user roles, activation, password reset links, and access controls from this table.",
          selector: "#tour-client-settings-users",
          side: "top",
          showSkip: true,
        },
      ]
    : [];
  return [
    {
      tour: TOUR_NAME,
      steps: [
        {
          icon: "👋",
          title: "Welcome to your client portal",
          content: "This quick tour shows where to find your leads, billing, support, and team settings.",
          selector: "#tour-client-sidebar",
          side: "right",
          showSkip: true,
        },
        {
          icon: "📊",
          title: "Dashboard",
          content: "This is your command center for lead performance, pipeline health, and daily trends.",
          selector: "#tour-client-nav-dashboard",
          side: "right",
        },
        {
          icon: "🎯",
          title: "Monitor key metrics",
          content:
            "Use these filters (date, category, country, assignee) to focus on the exact segment you want to analyze.",
          selector: "#tour-client-dashboard-header",
          side: "bottom",
        },
        {
          icon: "📈",
          title: "Pipeline summary cards",
          content:
            "These cards break down outcomes by status so you can quickly spot where leads are converting or stalling.",
          selector: "#tour-client-dashboard-status-grid",
          side: "top",
        },
        {
          icon: "📉",
          title: "Trends and funnel",
          content:
            "Review lead flow over time and stage distribution to understand momentum and bottlenecks.",
          selector: "#tour-client-dashboard-charts",
          side: "top",
          nextRoute: `${localePrefix}/client/leads`,
        },
        {
          icon: "📞",
          title: "Leads workspace",
          content:
            "Find specific leads quickly using search plus advanced filters for category, country, unit type, status, and assignee.",
          selector: "#tour-client-leads-filters",
          side: "bottom",
        },
        {
          icon: "📋",
          title: "Lead table actions",
          content:
            "Open a lead to update status, assignment, and notes so your team keeps a consistent follow-up process.",
          selector: "#tour-client-leads-table",
          side: "top",
        },
        {
          icon: "🧭",
          title: "Pagination and volume",
          content:
            "Move through pages here and track how many records match your active filters.",
          selector: "#tour-client-leads-pagination",
          side: "top",
          nextRoute: `${localePrefix}/client/billing`,
        },
        {
          icon: "💳",
          title: "Billing and lead flow",
          content:
            "Choose category, unit type, and monthly quantity here to activate and scale your lead delivery flow.",
          selector: "#tour-client-billing-purchase",
          side: "right",
        },
        {
          icon: "📈",
          title: "Usage and performance",
          content:
            "Track delivered leads, total spend, average CPL, and remaining estimated capacity.",
          selector: "#tour-client-billing-usage",
          side: "top",
        },
        {
          icon: "🧾",
          title: "Invoice and activity history",
          content:
            "Use budget activity and invoice tables for billing traceability and reconciliation.",
          selector: "#tour-client-billing-history",
          side: "top",
          nextRoute: `${localePrefix}/client/activity`,
        },
        {
          icon: "🧾",
          title: "Activity audit log",
          content: "Review recent actions and changes made by your team.",
          selector: "#tour-client-activity-log",
          side: "top",
          nextRoute: `${localePrefix}/client/support`,
        },
        {
          icon: "🛟",
          title: "Support contacts",
          content:
            "Need help with operations, delivery, or billing? Your support channels are listed here.",
          selector: "#tour-client-support-cards",
          side: "top",
          ...(isAdmin ? { nextRoute: `${localePrefix}/client/settings` } : {}),
        },
        ...agentSteps,
        ...adminSteps,
      ],
    },
  ];
}

function ClientTourCard({
  step,
  currentStep,
  totalSteps,
  nextStep,
  prevStep,
  skipTour,
  arrow,
}: CardComponentProps) {
  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;
  const progress = Math.round(((currentStep + 1) / Math.max(totalSteps, 1)) * 100);

  return (
    <div className="w-[min(360px,calc(100vw-2rem))] max-h-[min(78vh,620px)] overflow-y-auto rounded-xl border border-border bg-card p-4 text-card-foreground shadow-2xl">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold leading-tight">
            {step.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.content}</p>
        </div>
        <span className="text-xl" aria-hidden>{step.icon}</span>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Step {currentStep + 1} of {totalSteps}
      </p>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => skipTour?.()}
          className="rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted"
        >
          Skip
        </button>
        <div className="flex items-center gap-2">
          {!isFirst ? (
            <button
              type="button"
              onClick={prevStep}
              className="rounded-md border border-border px-3 py-2 text-sm transition hover:bg-muted"
            >
              Back
            </button>
          ) : null}
          <button
            type="button"
            onClick={nextStep}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            {isLast ? "Finish" : "Next"}
          </button>
        </div>
      </div>
      {arrow}
    </div>
  );
}

function ClientTourAutoStart({
  storageKey,
  pathname,
  canStart,
}: {
  storageKey: string;
  pathname: string;
  canStart: boolean;
}) {
  const { startNextStep } = useNextStep();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    if (!canStart) return;

    const normalizedPath = pathname.replace(/^\/(en|fr)(?=\/|$)/, "") || "/";
    if (!normalizedPath.startsWith("/client")) return;
    if (normalizedPath === "/client/setup") return;
    if (typeof window === "undefined") return;

    const alreadyCompleted = window.localStorage.getItem(storageKey) === "1";
    if (alreadyCompleted) return;

    startedRef.current = true;
    let attempts = 0;
    const maxAttempts = 6;
    const timer = window.setInterval(() => {
      attempts += 1;
      startNextStep(TOUR_NAME);
      if (attempts >= maxAttempts) {
        window.clearInterval(timer);
      }
    }, 300);

    return () => window.clearInterval(timer);
  }, [canStart, pathname, startNextStep, storageKey]);

  return null;
}

export function ClientOnboardingTour({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const localePrefix = getLocalePrefix(pathname);
  const { data: me, isLoading: meLoading } = useGetClientMeQuery();
  const userId = me?.id ?? null;

  const storageKey = `${TOUR_KEY_PREFIX}.${userId ?? "unknown"}`;
  const steps = useMemo(() => buildTourSteps(localePrefix, me?.role), [localePrefix, me?.role]);
  const canStart = !meLoading && Boolean(userId);

  function markTourComplete() {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, "1");
  }

  return (
    <NextStepProvider>
      <ClientTourAutoStart storageKey={storageKey} pathname={pathname} canStart={canStart} />
      <NextStep
        steps={steps}
        cardComponent={ClientTourCard}
        cardTransition={{ duration: 0.28, ease: "easeOut" }}
        shadowOpacity="0.65"
        onComplete={markTourComplete}
        onSkip={markTourComplete}
        overlayZIndex={1200}
      >
        {children}
      </NextStep>
    </NextStepProvider>
  );
}
