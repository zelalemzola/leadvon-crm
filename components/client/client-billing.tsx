"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  useGetClientMeQuery,
  useGetCustomerDashboardQuery,
  useGetLeadFlowsQuery,
  useGetMyDeliveryEntitlementsQuery,
  useGetMyDeliveryLedgerQuery,
  useGetMyInvoicesQuery,
  useGetTieredPricingQuoteMutation,
  useGetClientPricingTiersQuery,
  useCreateTieredFlowSessionMutation,
  useCreatePrepaidSessionMutation,
  useRunLeadFlowsNowMutation,
} from "@/lib/api/client-api";
import { useGetCategoriesQuery } from "@/lib/api/admin-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, BarChart3, CreditCard, CalendarClock } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";

export function ClientBilling() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: me } = useGetClientMeQuery();
  const { data: dashboard } = useGetCustomerDashboardQuery();
  const { data: entitlements, refetch: refetchEntitlements } =
    useGetMyDeliveryEntitlementsQuery();
  const { data: ledgerLines, refetch: refetchLedger } = useGetMyDeliveryLedgerQuery();
  const { data: invoices } = useGetMyInvoicesQuery();
  const { data: categories, isLoading: categoriesLoading } = useGetCategoriesQuery();
  const { data: leadFlows } = useGetLeadFlowsQuery();
  const [getTieredQuote, { isLoading: quotingTiered }] = useGetTieredPricingQuoteMutation();
  const [createTieredFlowSession, { isLoading: creatingTieredFlow }] =
    useCreateTieredFlowSessionMutation();
  const [createPrepaidSession, { isLoading: creatingPrepaid }] =
    useCreatePrepaidSessionMutation();
  const [runLeadFlowsNow, { isLoading: runningFlows }] = useRunLeadFlowsNowMutation();
  const [prepaidAmount, setPrepaidAmount] = useState(100);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [monthlyTargetLeads, setMonthlyTargetLeads] = useState<number>(100);
  const [tieredQuote, setTieredQuote] = useState<{
    price_per_lead_cents: number;
    total_cents: number;
    minimum_order_qty: number;
  } | null>(null);
  const [tieredQuoteError, setTieredQuoteError] = useState<string>("");
  const canManageBilling = me?.role === "customer_admin" && me?.is_active;

  const categoryOptions = useMemo(
    () =>
      (categories ?? [])
        .map((c) => ({ id: c.id, name: c.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories]
  );

  const activeCategoryId = selectedCategoryId || categoryOptions[0]?.id || "";
  const { data: pricingTiersData } = useGetClientPricingTiersQuery(
    { category_id: activeCategoryId },
    { skip: !activeCategoryId }
  );
  const tierBreakpoints = pricingTiersData?.tiers ?? [];
  const unitTypeOptions = pricingTiersData?.unit_types ?? [];
  const effectiveUnitType = unitTypeOptions[0] ?? "single";

  const estimatedLeadsPerWeek = useMemo(
    () => Math.max(1, Math.round((monthlyTargetLeads || 1) / 4.333)),
    [monthlyTargetLeads]
  );
  const sliderMinimum = Math.max(1, tieredQuote?.minimum_order_qty ?? 1);
  const sliderMaximum = 2000;
  const sliderStep = 1;
  const sliderMarks = useMemo(() => {
    const marks = new Set<number>([sliderMinimum]);
    for (const tier of tierBreakpoints ?? []) {
      marks.add(Number(tier.min_qty));
      if (tier.max_qty !== null) {
        marks.add(Number(tier.max_qty));
      }
    }
    marks.add(sliderMaximum);
    return [...marks]
      .filter((n) => Number.isFinite(n) && n >= sliderMinimum && n <= sliderMaximum)
      .sort((a, b) => a - b);
  }, [tierBreakpoints, sliderMinimum]);
  const sliderPercent = ((Math.min(sliderMaximum, Math.max(sliderMinimum, monthlyTargetLeads)) - sliderMinimum) / Math.max(1, sliderMaximum - sliderMinimum)) * 100;
  const sliderTierLabels = useMemo(
    () =>
      tierBreakpoints.map((tier) => ({
        id: tier.id,
        label: tier.max_qty === null ? `${tier.min_qty}+` : `${tier.min_qty}-${tier.max_qty}`,
      })),
    [tierBreakpoints]
  );

  const leadsReceived = dashboard?.totalLeads ?? 0;
  const totalDeliverySpend = useMemo(
    () =>
      (ledgerLines ?? []).reduce((sum, row) => sum + Number(row.amount_cents || 0), 0),
    [ledgerLines]
  );
  const avgCpl = leadsReceived > 0 ? totalDeliverySpend / leadsReceived : 0;
  const totalRemainingBudget = useMemo(
    () =>
      (entitlements ?? [])
        .filter((e) => e.status === "active")
        .reduce((sum, e) => sum + Number(e.budget_cents_remaining || 0), 0),
    [entitlements]
  );
  const estimatedLeadsLeft = avgCpl > 0 ? Math.floor(totalRemainingBudget / avgCpl) : null;

  const prepaidHandledRef = useRef<string | null>(null);
  const tieredHandledRef = useRef<string | null>(null);

  useEffect(() => {
    const prepaidState = searchParams.get("prepaid");
    if (!prepaidState) {
      prepaidHandledRef.current = null;
      return;
    }
    if (prepaidHandledRef.current === prepaidState) return;
    prepaidHandledRef.current = prepaidState;

    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      if (prepaidState === "success") {
        await Promise.all([refetchEntitlements(), refetchLedger()]);
        router.replace(pathname, { scroll: false });
        toast.success(t("clientBilling.toastPaymentReceived"));
        retryTimer = setTimeout(() => {
          void Promise.all([refetchEntitlements(), refetchLedger()]);
        }, 2500);
        return;
      }
      if (prepaidState === "cancel") {
        router.replace(pathname, { scroll: false });
        toast.info(t("clientBilling.toastCheckoutCanceled"));
      }
    })();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [searchParams, pathname, router, refetchEntitlements, refetchLedger, t]);

  useEffect(() => {
    const tieredState = searchParams.get("tiered");
    if (!tieredState) {
      tieredHandledRef.current = null;
      return;
    }
    if (tieredHandledRef.current === tieredState) return;
    tieredHandledRef.current = tieredState;
    void (async () => {
      if (tieredState === "success") {
        await Promise.all([refetchEntitlements(), refetchLedger()]);
        router.replace(pathname, { scroll: false });
        toast.success(t("clientBilling.toastTieredFlowActivated"));
        return;
      }
      if (tieredState === "cancel") {
        router.replace(pathname, { scroll: false });
        toast.info(t("clientBilling.toastTieredCheckoutCanceled"));
      }
    })();
  }, [searchParams, pathname, router, refetchEntitlements, refetchLedger, t]);

  useEffect(() => {
    if (!activeCategoryId || monthlyTargetLeads < 1) {
      setTieredQuote(null);
      setTieredQuoteError("");
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const quote = await getTieredQuote({
            category_id: activeCategoryId,
              unit_type: effectiveUnitType,
            quantity: monthlyTargetLeads,
          }).unwrap();
          setTieredQuote(quote);
          setTieredQuoteError("");
        } catch (err: unknown) {
          setTieredQuote(null);
          const msg =
            err && typeof err === "object" && "data" in err
              ? String((err as { data?: unknown }).data)
              : t("clientBilling.calculatingQuoteFailed");
          setTieredQuoteError(msg);
        }
      })();
    }, 300);
    return () => clearTimeout(timer);
  }, [activeCategoryId, effectiveUnitType, monthlyTargetLeads, getTieredQuote]);

  async function startPrepaid() {
    if (!canManageBilling) {
      toast.error(t("clientBilling.toastOnlyAdminsPrepaid"));
      return;
    }
    try {
      const dollars = Math.max(5, prepaidAmount || 0);
      const amount_cents = Math.round(dollars * 100);
      if (amount_cents < 500) {
        toast.error(t("clientBilling.toastMinPrepaid"));
        return;
      }
      const { url } = await createPrepaidSession({ amount_cents }).unwrap();
      window.location.assign(url);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : t("clientBilling.toastStartCheckoutFailed");
      toast.error(msg);
    }
  }

  async function activateLeadFlow() {
    if (!activeCategoryId) {
      toast.error(t("clientBilling.toastSelectCategory"));
      return;
    }
    if (!canManageBilling) {
      toast.error(t("clientBilling.toastOnlyAdminsFlows"));
      return;
    }
    try {
      if (monthlyTargetLeads < sliderMinimum) {
        toast.error(
          t("clientBilling.minimumOrderNotice").replace("{qty}", String(sliderMinimum))
        );
        return;
      }
      const { url } = await createTieredFlowSession({
        category_id: activeCategoryId,
        unit_type: effectiveUnitType,
        quantity: monthlyTargetLeads,
        monthly_target_leads: monthlyTargetLeads,
        business_days_only: true,
      }).unwrap();
      window.location.assign(url);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : t("clientBilling.toastActivateFlowFailed");
      toast.error(msg);
    }
  }

  async function triggerFlowRun() {
    if (!canManageBilling) return;
    try {
      const res = await runLeadFlowsNow().unwrap();
      const n = res.leads_delivered ?? res.processed;
      if (n > 0) {
        toast.success(
          `${t("clientBilling.toastDeliveredPrefix")} ${n} ${t("clientBilling.leadWord")}${n === 1 ? "" : t("clientBilling.leadPluralSuffix")}. ${t("clientBilling.toastDeliveredSuffix")}`
        );
        return;
      }
      toast.info(
        t("clientBilling.toastNoDelivery")
      );
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : t("clientBilling.toastRunFlowsFailed");
      toast.error(msg);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("clientBilling.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("clientBilling.subtitle")}
        </p>
        <div
          className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-muted-foreground"
          role="status"
        >
          <strong className="font-medium text-foreground">{t("clientBilling.howItWorksLabel")}</strong>{" "}
          {t("clientBilling.howItWorksText")}
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card id="tour-client-billing-purchase" className="border-border/70 bg-card/50 xl:col-span-2">
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="size-4 text-primary" />
              {t("clientBilling.purchaseLeads")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>{t("clientBilling.product")}</Label>
                <Select
                  value={activeCategoryId}
                  onValueChange={setSelectedCategoryId}
                  disabled={categoriesLoading}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        categoriesLoading
                          ? t("clientBilling.loadingPackages")
                          : categoryOptions.length === 0
                            ? t("clientBilling.noPackages")
                            : t("clientBilling.selectCategory")
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {categoryOptions.length === 0 && !categoriesLoading && (
                  <p className="text-xs text-muted-foreground">
                    {t("clientBilling.noActivePackagesHint")}
                  </p>
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-2 md:items-start">
                <div className="space-y-2 md:min-w-0">
                  <Label>{t("clientBilling.estimatedWeeklyLabel")}</Label>
                  <div className="rounded-md border border-border/60 bg-background/40 p-3 text-sm">
                    <strong>{estimatedLeadsPerWeek}</strong> {t("clientBilling.leadsPerWeek")}
                  </div>
                  <p className="min-h-[2.5rem] text-xs leading-relaxed text-muted-foreground">
                    {t("clientBilling.estimatedWeeklyPrefix")} <strong>{estimatedLeadsPerWeek}</strong>{" "}
                    {t("clientBilling.estimatedWeeklySuffix")}
                  </p>
                </div>
                <div className="space-y-2 md:min-w-0">
                  <Label>{t("clientBilling.monthlyQuantity")}</Label>
                  <div className="space-y-3 rounded-md border border-border/60 bg-background/40 p-3">
                    <div className="relative">
                      <div
                        className="mb-1 inline-flex rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                        style={{
                          marginLeft: `calc(${sliderPercent}% - 26px)`,
                        }}
                      >
                        {monthlyTargetLeads}
                      </div>
                      <input
                        type="range"
                        min={sliderMinimum}
                        max={sliderMaximum}
                        step={sliderStep}
                        value={Math.min(sliderMaximum, Math.max(sliderMinimum, monthlyTargetLeads))}
                        onChange={(e) =>
                          setMonthlyTargetLeads(
                            Math.max(sliderMinimum, Math.min(sliderMaximum, Number(e.target.value)))
                          )
                        }
                        className="h-2 w-full cursor-pointer accent-primary"
                      />
                      <div className="relative mt-1 h-3">
                        {sliderMarks.map((mark) => (
                          <span
                            key={mark}
                            className="absolute top-0 h-2 w-px bg-border"
                            style={{
                              left: `${((mark - sliderMinimum) / Math.max(1, sliderMaximum - sliderMinimum)) * 100}%`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {t("clientBilling.sliderMin")}: {sliderMinimum}
                      </span>
                      <span>
                        {t("clientBilling.sliderMax")}: {sliderMaximum}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      {sliderTierLabels.length > 0
                        ? sliderTierLabels.map((tier) => (
                            <span key={`label-${tier.id}`} className="rounded border border-border/60 px-1.5 py-0.5">
                              {tier.label}
                            </span>
                          ))
                        : sliderMarks.slice(0, 8).map((mark) => (
                            <span key={`label-${mark}`} className="rounded border border-border/60 px-1.5 py-0.5">
                              {mark}
                            </span>
                          ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="monthly-qty" className="text-xs text-muted-foreground">
                        {t("clientBilling.monthlyQuantity")}
                      </Label>
                      <Input
                        id="monthly-qty"
                        type="number"
                        min={sliderMinimum}
                        max={sliderMaximum}
                        value={monthlyTargetLeads}
                        onChange={(e) => {
                          const next = Number(e.target.value) || sliderMinimum;
                          setMonthlyTargetLeads(Math.max(sliderMinimum, Math.min(sliderMaximum, next)));
                        }}
                        className="h-8 w-28"
                      />
                    </div>
                  </div>
                  <p className="min-h-[2.5rem] text-xs leading-relaxed text-muted-foreground">
                    {activeCategoryId && tieredQuote
                      ? `${t("clientBilling.pricePerLead")}: ${money(tieredQuote.price_per_lead_cents)} · ${t("clientBilling.total")}: ${money(tieredQuote.total_cents)}`
                      : quotingTiered
                        ? t("clientBilling.calculatingQuote")
                        : t("clientBilling.monthlyQuantityHint")}
                  </p>
                </div>
              </div>
            </div>
            <Button
              className="w-full"
              onClick={() => void activateLeadFlow()}
              disabled={
                creatingTieredFlow ||
                quotingTiered ||
                !canManageBilling ||
                !activeCategoryId ||
                !tieredQuote
              }
            >
              {creatingTieredFlow
                ? t("clientBilling.activating")
                : t("clientBilling.startOrUpdatePlanAndPay")}
            </Button>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
              {tieredQuote ? (
                <p>
                  <strong>{t("clientBilling.totalDueNow")}:</strong>{" "}
                  <span className="tabular-nums">{money(tieredQuote.total_cents)}</span>{" "}
                  <span className="text-muted-foreground">
                    ({t("clientBilling.pricePerLead")}: {money(tieredQuote.price_per_lead_cents)})
                  </span>
                </p>
              ) : (
                <p className="text-muted-foreground">
                  {quotingTiered
                    ? t("clientBilling.calculatingQuote")
                    : tieredQuoteError || t("clientBilling.selectCategoryAndQuantityForTotal")}
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("clientBilling.tieredCheckoutAddsBudgetHint")}
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void triggerFlowRun()}
              disabled={runningFlows || !canManageBilling}
            >
              {runningFlows ? t("clientBilling.running") : t("clientBilling.runDueFlows")}
            </Button>
            <p className="text-xs text-muted-foreground">
              {canManageBilling
                ? t("clientBilling.autoDeliveryHint")
                : t("clientBilling.onlyAdminsHint")}
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card id="tour-client-billing-usage" className="border-border/70 bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <CreditCard className="size-4 text-primary" />
                  {t("clientBilling.prepaidBudget")}
                </span>
                <Button
                  size="sm"
                  onClick={() => void startPrepaid()}
                  disabled={creatingPrepaid || !canManageBilling}
                >
                  {t("clientBilling.addBudgetTopUp")}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {t("clientBilling.prepaidHintBefore")}{" "}
                <strong>30 {t("clientBilling.calendarDays")}</strong>{" "}
                {t("clientBilling.prepaidHintAfter")}
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="prepaid-amt">{t("clientBilling.amountUsd")}</Label>
                  <Input
                    id="prepaid-amt"
                    type="number"
                    min={5}
                    step={1}
                    value={prepaidAmount}
                    onChange={(e) => setPrepaidAmount(Math.max(5, Number(e.target.value) || 5))}
                    className="w-32"
                    disabled={!canManageBilling}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">{t("clientBilling.activePeriods")}</p>
                {(entitlements ?? []).filter((e) => e.status === "active").length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("clientBilling.noPrepaidPeriods")}</p>
                ) : (
                  <ul className="space-y-2 text-xs">
                    {(entitlements ?? [])
                      .filter((e) => e.status === "active")
                      .slice(0, 5)
                      .map((e) => (
                        <li
                          key={e.id}
                          className="flex flex-col gap-0.5 rounded-md border border-border/60 bg-background/40 px-2 py-1.5"
                        >
                          <span className="font-medium tabular-nums">
                            {money(e.budget_cents_remaining)} / {money(e.budget_cents_total)}{" "}
                            {t("clientBilling.remaining")}
                          </span>
                          <span className="text-muted-foreground">
                            {new Date(e.period_start).toLocaleDateString()} →{" "}
                            {new Date(e.period_end).toLocaleDateString()}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="size-4 text-primary" />
                {t("clientBilling.activeFlows")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(leadFlows ?? []).filter((f) => f.is_active).slice(0, 4).map((flow) => (
                <div key={flow.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      {flow.categories?.name ?? t("clientBilling.package")} — {flow.leads_per_week}/{t("clientBilling.week")}
                    </span>
                    <Badge className="bg-emerald-500/15 text-emerald-300">{t("clientBilling.active")}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("clientBilling.queue")}:{" "}
                    <strong className="text-foreground">
                      {(flow.pending_delivery_leads ?? 0) > 0
                        ? `${flow.pending_delivery_leads} ${t("clientBilling.leadWord")}${flow.pending_delivery_leads === 1 ? "" : t("clientBilling.leadPluralSuffix")} ${t("clientBilling.waiting")}`
                        : t("clientBilling.caughtUp")}
                    </strong>
                    . {t("clientBilling.lastDelivery")}:{" "}
                    {flow.last_run_at ? new Date(flow.last_run_at).toLocaleString() : t("clientDashboard.na")}.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("clientBilling.pace")}:{" "}
                    <strong className="text-foreground">
                      {flow.delivered_this_month ?? 0} /{" "}
                      {flow.customer_flow_commitments?.[0]?.monthly_target_leads ??
                        flow.accrued_this_month ??
                        0}
                    </strong>{" "}
                    {t("clientBilling.leadsThisMonth")}
                    {flow.accrued_this_month
                      ? ` (${Math.min(100, Math.round(((flow.delivered_this_month ?? 0) / Math.max(1, flow.accrued_this_month)) * 100))}% ${t("clientBilling.ofAccruedDue")})`
                      : ""}
                    .
                  </p>
                  {flow.accrued_this_month ? (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              ((flow.delivered_this_month ?? 0) / Math.max(1, flow.accrued_this_month)) * 100
                            )
                          )}%`,
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              ))}
              {((leadFlows ?? []).filter((f) => f.is_active).length === 0) ? (
                <p className="text-xs text-muted-foreground">{t("clientBilling.noActiveFlows")}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="size-4 text-primary" />
                {t("clientBilling.usageSummary")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-center md:grid-cols-4">
                <div className="rounded-lg border border-border/60 bg-background/50 p-2">
                  <p className="text-xs text-muted-foreground">{t("clientBilling.leadsReceived")}</p>
                  <p className="text-lg font-semibold tabular-nums">{leadsReceived}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-background/50 p-2">
                  <p className="text-xs text-muted-foreground">{t("clientBilling.deliverySpend")}</p>
                  <p className="text-lg font-semibold tabular-nums">{money(totalDeliverySpend)}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-background/50 p-2">
                  <p className="text-xs text-muted-foreground">{t("clientBilling.avgCpl")}</p>
                  <p className="text-lg font-semibold tabular-nums">{money(Math.round(avgCpl))}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-background/50 p-2">
                  <p className="text-xs text-muted-foreground">{t("clientBilling.estimatedLeadsLeft")}</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {estimatedLeadsLeft !== null ? estimatedLeadsLeft : t("clientDashboard.na")}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {t("clientBilling.estimatedHint")}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{t("clientBilling.byProduct")}</p>
                {(dashboard?.byCategory ?? []).slice(0, 5).map((row) => (
                  <div key={row.name} className="flex items-center justify-between text-sm">
                    <span>{row.name}</span>
                    <span className="font-medium">{row.count} {t("clientBilling.leads")}</span>
                  </div>
                ))}
                {(dashboard?.byCategory ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("clientBilling.noLeadUsage")}</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card id="tour-client-billing-history" className="border-border/70 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">{t("clientBilling.budgetActivity")}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {t("clientBilling.budgetActivityHint")}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("clientBilling.date")}</TableHead>
                <TableHead>{t("clientBilling.amount")}</TableHead>
                <TableHead>{t("clientBilling.category")}</TableHead>
                <TableHead>{t("clientBilling.invoice")}</TableHead>
                <TableHead>{t("clientBilling.balanceAfter")}</TableHead>
                <TableHead>{t("clientBilling.notes")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(ledgerLines ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                    {t("clientBilling.noDeliveryCharges")}
                  </TableCell>
                </TableRow>
              ) : (
                (ledgerLines ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-medium tabular-nums">{money(row.amount_cents)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {(row as { categories?: { name?: string } | null }).categories?.name ?? t("clientDashboard.na")}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {row.invoice_id ? row.invoice_id.slice(0, 8) : t("clientDashboard.na")}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {money(row.balance_after_cents)}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-muted-foreground">
                      {row.description || t("clientDashboard.na")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">{t("clientBilling.invoices")}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {t("clientBilling.invoicesHint")}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("clientBilling.created")}</TableHead>
                <TableHead>{t("clientBilling.type")}</TableHead>
                <TableHead>{t("clientBilling.period")}</TableHead>
                <TableHead>{t("clientBilling.status")}</TableHead>
                <TableHead>{t("clientBilling.total")}</TableHead>
                <TableHead>{t("clientBilling.reference")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invoices ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                    {t("clientBilling.noInvoices")}
                  </TableCell>
                </TableRow>
              ) : (
                (invoices ?? []).map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="text-muted-foreground">
                      {new Date(inv.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {inv.invoice_type.replaceAll("_", " ")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(inv.period_start).toLocaleDateString()} -{" "}
                      {new Date(inv.period_end).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          inv.status === "paid"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : inv.status === "open"
                              ? "bg-amber-500/15 text-amber-300"
                              : "bg-muted text-muted-foreground"
                        }
                      >
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium tabular-nums">{money(inv.total_cents)}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-muted-foreground">
                      {inv.stripe_payment_ref ?? t("clientDashboard.na")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    (cents ?? 0) / 100
  );
}
