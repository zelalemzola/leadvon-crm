"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  useGetClientMeQuery,
  useGetCustomerDashboardQuery,
  useGetWalletQuery,
  useGetWalletTransactionsQuery,
  useGetClientPackagesQuery,
  useGetClientOffersQuery,
  useGetLeadFlowsQuery,
  useCreateTopupSessionMutation,
  useUpsertLeadFlowMutation,
  useRunLeadFlowsNowMutation,
  usePurchasePackageMutation,
} from "@/lib/api/client-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, Zap, BarChart3 } from "lucide-react";

export function ClientBilling() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: me } = useGetClientMeQuery();
  const { data: dashboard } = useGetCustomerDashboardQuery();
  const { data: wallet, refetch: refetchWallet } = useGetWalletQuery();
  const { data: tx, refetch: refetchTx } = useGetWalletTransactionsQuery();
  const {
    data: packages,
    isLoading: packagesLoading,
    isError: packagesError,
  } = useGetClientPackagesQuery();
  const { data: offers } = useGetClientOffersQuery();
  const { data: leadFlows } = useGetLeadFlowsQuery();
  const [createTopupSession, { isLoading: creatingTopup }] = useCreateTopupSessionMutation();
  const [upsertLeadFlow, { isLoading: savingFlow }] = useUpsertLeadFlowMutation();
  const [runLeadFlowsNow, { isLoading: runningFlows }] = useRunLeadFlowsNowMutation();
  const [purchasePackage, { isLoading: purchasingNow }] = usePurchasePackageMutation();
  const [topupAmount, setTopupAmount] = useState(50);
  const [selectedPackageId, setSelectedPackageId] = useState<string>("");
  const [buyNowPackageQty, setBuyNowPackageQty] = useState(1);
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

  const estimatedQty = useMemo(() => {
    if (!selectedPackage) return 1;
    return Math.max(1, Math.ceil((leadsPerWeek || 1) / selectedPackage.leads_count));
  }, [selectedPackage, leadsPerWeek]);

  const oneOffUnitCents = useMemo(() => {
    if (!selectedPackage) return 0;
    const discount = offersByPackage.get(selectedPackage.id) ?? 0;
    return Math.round(selectedPackage.price_cents * ((100 - discount) / 100));
  }, [selectedPackage, offersByPackage]);

  const oneOffTotalCents = oneOffUnitCents * Math.min(100, Math.max(1, buyNowPackageQty || 1));
  const oneOffLeadEstimate =
    selectedPackage && buyNowPackageQty >= 1
      ? selectedPackage.leads_count * Math.min(100, Math.max(1, buyNowPackageQty))
      : 0;
  const availableNow = selectedPackage?.available_unsold_leads ?? 0;
  const likelyShort = selectedPackage ? oneOffLeadEstimate > availableNow : false;

  const leadsReceived = dashboard?.totalLeads ?? 0;
  const totalSpent = useMemo(
    () =>
      (tx ?? [])
        .filter((t) => t.tx_type === "debit")
        .reduce((sum, row) => sum + Number(row.amount_cents || 0), 0),
    [tx]
  );
  const avgCpl = leadsReceived > 0 ? totalSpent / leadsReceived : 0;

  /** Avoid duplicate handling (e.g. React Strict Mode) while ?topup= is still present. */
  const topupHandledRef = useRef<string | null>(null);

  useEffect(() => {
    const topupState = searchParams.get("topup");
    if (!topupState) {
      topupHandledRef.current = null;
      return;
    }
    if (topupHandledRef.current === topupState) return;
    topupHandledRef.current = topupState;

    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      if (topupState === "success") {
        await Promise.all([refetchWallet(), refetchTx()]);
        router.replace(pathname, { scroll: false });
        toast.success("Payment received. Your wallet balance has been updated.");
        retryTimer = setTimeout(() => {
          void Promise.all([refetchWallet(), refetchTx()]);
        }, 2500);
        return;
      }
      if (topupState === "cancel") {
        router.replace(pathname, { scroll: false });
        toast.info("Top-up canceled.");
      }
    })();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [searchParams, pathname, router, refetchWallet, refetchTx]);

  async function startTopup() {
    if (!canManageBilling) {
      toast.error("Only customer admins can top up wallets.");
      return;
    }
    try {
      const dollars = Math.max(5, topupAmount || 0);
      const { url } = await createTopupSession({ amount_cents: dollars * 100 }).unwrap();
      window.location.assign(url);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : "Could not start top-up";
      toast.error(msg);
    }
  }

  async function purchaseNow() {
    if (!selectedPackage) {
      toast.error("Select a package first.");
      return;
    }
    if (!canManageBilling) {
      toast.error("Only customer admins can purchase packages.");
      return;
    }
    const qty = Math.min(100, Math.max(1, buyNowPackageQty || 1));
    try {
      const res = await purchasePackage({
        package_id: selectedPackage.id,
        quantity: qty,
      }).unwrap();
      toast.success(
        `Purchased ${res.leads_allocated} leads. Charged ${money(res.total_amount_cents)} from wallet.`
      );
    } catch (err: unknown) {
      const raw =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : "Purchase failed";
      const msg = raw.toLowerCase();
      if (msg.includes("not enough leads")) {
        toast.error("We couldn't complete this purchase right now because inventory is low. Try a smaller quantity or another package.");
        return;
      }
      if (msg.includes("insufficient wallet")) {
        toast.error("Your wallet balance is too low for this purchase. Please add funds and try again.");
        return;
      }
      toast.error("We couldn't complete this purchase right now. Please try again shortly.");
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
      if (res.failed.length === 0) {
        toast.success(`Processed ${res.processed} lead flow(s).`);
        return;
      }
      toast.success(`Processed ${res.processed} flow(s), ${res.failed.length} need attention.`);
      const detail = res.failed
        .slice(0, 2)
        .map((f) => `${f.package_name}: ${f.reason}`)
        .join(" ");
      toast.info(detail || "Some flows could not run right now. We'll try again on the next run.");
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
          Wallet, package purchases, and transaction history.
        </p>
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
                <Label>Leads per week</Label>
                <Input
                  type="number"
                  min={1}
                  value={leadsPerWeek}
                  onChange={(e) => setLeadsPerWeek(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-4">
              <p className="text-sm font-medium">Buy once (wallet)</p>
              <p className="text-xs text-muted-foreground">
                Charge your wallet immediately for this package. No Stripe checkout—balance must cover the total.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-2">
                  <Label htmlFor="buy-now-qty">Package quantity</Label>
                  <Input
                    id="buy-now-qty"
                    type="number"
                    min={1}
                    max={100}
                    className="w-28"
                    value={buyNowPackageQty}
                    onChange={(e) =>
                      setBuyNowPackageQty(Math.min(100, Math.max(1, Number(e.target.value) || 1)))
                    }
                    disabled={!selectedPackage}
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <p className="text-muted-foreground">
                    Est. total <span className="font-medium text-foreground">{money(oneOffTotalCents)}</span>
                    {selectedPackage ? (
                      <span className="text-muted-foreground">
                        {" "}
                        (~{oneOffLeadEstimate} leads if inventory allows)
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
              <Button
                className="w-full sm:w-auto"
                onClick={() => void purchaseNow()}
                disabled={
                  purchasingNow || !canManageBilling || !selectedPackage || (packages ?? []).length === 0
                }
              >
                {purchasingNow ? "Purchasing…" : "Purchase now"}
              </Button>
              {selectedPackage ? (
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>
                    Available right now: <span className="font-medium text-foreground">{availableNow}</span> leads
                  </p>
                  {likelyShort ? (
                    <p className="text-amber-300">
                      Requested volume may exceed current inventory. Consider a smaller quantity.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <p className="text-xs text-muted-foreground">
              Recurring — estimated package quantity per run: {estimatedQty}
            </p>
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
                ? "Buy once debits your wallet immediately. Lead flow saves recurring intent; use run-now or cron to execute due flows."
                : "Only customer admins can top up or buy packages."}
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border/70 bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <Wallet className="size-4 text-primary" />
                  Current Balance
                </span>
                <Button size="sm" onClick={() => void startTopup()} disabled={creatingTopup || !canManageBilling}>
                  Add Funds
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-3xl font-semibold tabular-nums">{money(wallet?.balance_cents ?? 0)}</p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={5}
                  step={1}
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(Math.max(5, Number(e.target.value) || 5))}
                  className="w-32"
                  disabled={!canManageBilling}
                />
                <p className="text-xs text-muted-foreground">USD</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Active plans</p>
                {(leadFlows ?? []).filter((f) => f.is_active).slice(0, 4).map((flow) => (
                  <div key={flow.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>
                        {flow.lead_packages?.name ?? "Package"} - {flow.leads_per_week}/week
                      </span>
                      <Badge className="bg-emerald-500/15 text-emerald-300">Active</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Last run: {flow.last_run_at ? new Date(flow.last_run_at).toLocaleString() : "Not run yet"}.
                      {" "}Next retry: {new Date(flow.next_run_at).toLocaleString()}.
                    </p>
                  </div>
                ))}
                {((leadFlows ?? []).filter((f) => f.is_active).length === 0) ? (
                  <p className="text-xs text-muted-foreground">No active plans yet.</p>
                ) : null}
              </div>
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
                  <p className="text-xs text-muted-foreground">Total Spent</p>
                  <p className="text-lg font-semibold tabular-nums">{money(totalSpent)}</p>
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
          <CardTitle className="text-base">Transactions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tx ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={5} className="h-20 text-center">No transactions yet.</TableCell></TableRow>
              ) : (
                (tx ?? []).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Badge className={t.tx_type === "credit" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}>
                        {t.tx_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{money(t.amount_cents)}</TableCell>
                    <TableCell className="text-muted-foreground">{t.reference_type}</TableCell>
                    <TableCell className="text-muted-foreground">{t.description || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(t.created_at).toLocaleString()}</TableCell>
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
