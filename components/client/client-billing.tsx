"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  useGetClientMeQuery,
  useGetCustomerDashboardQuery,
  useGetClientPackagesQuery,
  useGetClientOffersQuery,
  useGetLeadFlowsQuery,
  useGetMyDeliveryEntitlementsQuery,
  useGetMyDeliveryLedgerQuery,
  useCreatePrepaidSessionMutation,
  useUpsertLeadFlowMutation,
  useRunLeadFlowsNowMutation,
} from "@/lib/api/client-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, BarChart3, CreditCard, CalendarClock } from "lucide-react";

export function ClientBilling() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: me } = useGetClientMeQuery();
  const { data: dashboard } = useGetCustomerDashboardQuery();
  const { data: entitlements, refetch: refetchEntitlements } =
    useGetMyDeliveryEntitlementsQuery();
  const { data: ledgerLines, refetch: refetchLedger } = useGetMyDeliveryLedgerQuery();
  const {
    data: packages,
    isLoading: packagesLoading,
    isError: packagesError,
  } = useGetClientPackagesQuery();
  const { data: offers } = useGetClientOffersQuery();
  const { data: leadFlows } = useGetLeadFlowsQuery();
  const [createPrepaidSession, { isLoading: creatingPrepaid }] =
    useCreatePrepaidSessionMutation();
  const [upsertLeadFlow, { isLoading: savingFlow }] = useUpsertLeadFlowMutation();
  const [runLeadFlowsNow, { isLoading: runningFlows }] = useRunLeadFlowsNowMutation();
  const [prepaidAmount, setPrepaidAmount] = useState(100);
  const [selectedPackageId, setSelectedPackageId] = useState<string>("");
  const [leadsPerWeek, setLeadsPerWeek] = useState<number>(100);
  const canManageBilling = me?.role === "customer_admin" && me?.is_active;

  const offersByPackage = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of offers ?? []) {
      const cur = m.get(o.package_id) ?? 0;
      m.set(o.package_id, Math.max(cur, Number(o.discount_percent)));
    }
    return m;
  }, [offers]);

  const activePackageId = selectedPackageId || packages?.[0]?.id || "";
  const selectedPackage = useMemo(
    () => (packages ?? []).find((p) => p.id === activePackageId) ?? null,
    [packages, activePackageId]
  );

  /** Rough daily target: spread weekly goal across 7 days (matches server accrual). */
  const dailyTargetLeads = useMemo(
    () => Math.max(1, Math.ceil((leadsPerWeek || 1) / 7)),
    [leadsPerWeek]
  );

  const leadsReceived = dashboard?.totalLeads ?? 0;
  const totalDeliverySpend = useMemo(
    () =>
      (ledgerLines ?? []).reduce((sum, row) => sum + Number(row.amount_cents || 0), 0),
    [ledgerLines]
  );
  const avgCpl = leadsReceived > 0 ? totalDeliverySpend / leadsReceived : 0;

  const prepaidHandledRef = useRef<string | null>(null);

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
        toast.success(
          "Payment received. Your prepaid delivery budget is active for 30 days from payment."
        );
        retryTimer = setTimeout(() => {
          void Promise.all([refetchEntitlements(), refetchLedger()]);
        }, 2500);
        return;
      }
      if (prepaidState === "cancel") {
        router.replace(pathname, { scroll: false });
        toast.info("Prepaid checkout canceled.");
      }
    })();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [searchParams, pathname, router, refetchEntitlements, refetchLedger]);

  async function startPrepaid() {
    if (!canManageBilling) {
      toast.error("Only customer admins can add prepaid delivery budget.");
      return;
    }
    try {
      const dollars = Math.max(5, prepaidAmount || 0);
      const amount_cents = Math.round(dollars * 100);
      if (amount_cents < 500) {
        toast.error("Minimum prepaid amount is $5.");
        return;
      }
      const { url } = await createPrepaidSession({ amount_cents }).unwrap();
      window.location.assign(url);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : "Could not start checkout";
      toast.error(msg);
    }
  }

  async function activateLeadFlow() {
    if (!selectedPackage) {
      toast.error("Select a package first.");
      return;
    }
    if (!canManageBilling) {
      toast.error("Only customer admins can activate lead flows.");
      return;
    }
    try {
      await upsertLeadFlow({
        package_id: selectedPackage.id,
        leads_per_week: leadsPerWeek,
        is_active: true,
      }).unwrap();
      toast.success("Lead flow activated");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : "Could not activate lead flow";
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
          `Delivered ${n} lead${n === 1 ? "" : "s"}. Undelivered queue will keep clearing as inventory and budget allow.`
        );
        return;
      }
      toast.info(
        "No leads were delivered this run — usually because inventory is still catching up or your prepaid budget needs a top-up. We will keep trying automatically."
      );
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : "Could not run lead flows";
      toast.error(msg);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Pay for delivery budget with Stripe, manage recurring lead flows, and review charges
          against your prepaid budget.
        </p>
        <div
          className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-muted-foreground"
          role="status"
        >
          <strong className="font-medium text-foreground">How delivery works:</strong> each UTC day we add
          your fair share of the week&apos;s goal to a delivery queue. We assign leads as soon as
          inventory and your prepaid budget allow — including catching up if we were short earlier.
          Runs often throughout the day; you can also use &quot;Run due flows now&quot; anytime.
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="border-border/70 bg-card/50 xl:col-span-2">
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="size-4 text-primary" />
              Purchase Leads
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Product</Label>
                <Select
                  value={activePackageId}
                  onValueChange={setSelectedPackageId}
                  disabled={packagesLoading}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        packagesLoading
                          ? "Loading packages…"
                          : packagesError
                            ? "Could not load packages"
                            : (packages ?? []).length === 0
                              ? "No packages available"
                              : "Select package"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(packages ?? []).map((p) => {
                      const discount = offersByPackage.get(p.id) ?? 0;
                      const final = Math.round(p.price_cents * ((100 - discount) / 100));
                      return (
                        <SelectItem key={p.id} value={p.id}>
                          {p.categories?.name ?? "Category"} - {money(final)} / {p.leads_count} leads
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {(packages ?? []).length === 0 && !packagesLoading && (
                  <p className="text-xs text-muted-foreground">
                    {packagesError
                      ? "Packages could not be loaded. Check your connection or try again."
                      : "No active packages in catalog. Ask an admin to add packages under Pricing."}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Leads per week (target)</Label>
                <Input
                  type="number"
                  min={1}
                  value={leadsPerWeek}
                  onChange={(e) => setLeadsPerWeek(Math.max(1, Number(e.target.value) || 1))}
                />
                <p className="text-xs text-muted-foreground">
                  Roughly <strong>{dailyTargetLeads}</strong> leads accrue toward your queue each UTC day
                  (rounded up). Actual deliveries depend on inventory and prepaid budget.
                </p>
              </div>
            </div>
            <Button
              className="w-full"
              onClick={() => void activateLeadFlow()}
              disabled={savingFlow || !canManageBilling || !selectedPackage}
            >
              {savingFlow ? "Activating..." : "Activate Lead Flow"}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void triggerFlowRun()}
              disabled={runningFlows || !canManageBilling}
            >
              {runningFlows ? "Running..." : "Run Due Flows Now"}
            </Button>
            <p className="text-xs text-muted-foreground">
              {canManageBilling
                ? "Automated delivery runs frequently (at least when our scheduler runs). This button tries immediately for your organization — useful after you add prepaid or when you know new inventory landed."
                : "Only customer admins can change billing and lead flows."}
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border/70 bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <CreditCard className="size-4 text-primary" />
                  Prepaid delivery budget
                </span>
                <Button
                  size="sm"
                  onClick={() => void startPrepaid()}
                  disabled={creatingPrepaid || !canManageBilling}
                >
                  Pay with Stripe
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Pay by card when you need coverage. We add a delivery budget for your organization
                (rolling <strong>30 calendar days</strong> from payment). Leads are charged against
                this budget as they are delivered — not a stored balance you withdraw.
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="prepaid-amt">Amount (USD)</Label>
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
                <p className="text-xs font-medium text-muted-foreground">Active periods</p>
                {(entitlements ?? []).filter((e) => e.status === "active").length === 0 ? (
                  <p className="text-xs text-muted-foreground">No prepaid periods yet.</p>
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
                            remaining
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
                Active lead flows
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(leadFlows ?? []).filter((f) => f.is_active).slice(0, 4).map((flow) => (
                <div key={flow.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      {flow.lead_packages?.name ?? "Package"} — {flow.leads_per_week}/week
                    </span>
                    <Badge className="bg-emerald-500/15 text-emerald-300">Active</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Queue:{" "}
                    <strong className="text-foreground">
                      {(flow.pending_delivery_leads ?? 0) > 0
                        ? `${flow.pending_delivery_leads} lead${flow.pending_delivery_leads === 1 ? "" : "s"} waiting`
                        : "caught up"}
                    </strong>
                    . Last delivery:{" "}
                    {flow.last_run_at ? new Date(flow.last_run_at).toLocaleString() : "—"}.
                  </p>
                </div>
              ))}
              {((leadFlows ?? []).filter((f) => f.is_active).length === 0) ? (
                <p className="text-xs text-muted-foreground">No active lead flows yet.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="size-4 text-primary" />
                Usage Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-border/60 bg-background/50 p-2">
                  <p className="text-xs text-muted-foreground">Leads Received</p>
                  <p className="text-lg font-semibold tabular-nums">{leadsReceived}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-background/50 p-2">
                  <p className="text-xs text-muted-foreground">Delivery spend</p>
                  <p className="text-lg font-semibold tabular-nums">{money(totalDeliverySpend)}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-background/50 p-2">
                  <p className="text-xs text-muted-foreground">Avg CPL</p>
                  <p className="text-lg font-semibold tabular-nums">{money(Math.round(avgCpl))}</p>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">By Product</p>
                {(dashboard?.byCategory ?? []).slice(0, 5).map((row) => (
                  <div key={row.name} className="flex items-center justify-between text-sm">
                    <span>{row.name}</span>
                    <span className="font-medium">{row.count} leads</span>
                  </div>
                ))}
                {(dashboard?.byCategory ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No lead usage yet.</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-border/70 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">Budget activity</CardTitle>
          <p className="text-xs text-muted-foreground">
            Charges posted when leads are delivered against your prepaid delivery budget.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Balance after</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(ledgerLines ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                    No delivery charges yet. Add a prepaid budget above, then leads will appear here
                    when delivered.
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
                      {(row as { categories?: { name?: string } | null }).categories?.name ?? "—"}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {money(row.balance_after_cents)}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-muted-foreground">
                      {row.description || "—"}
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
