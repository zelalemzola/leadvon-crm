"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  const searchParams = useSearchParams();
  const { data: me } = useGetClientMeQuery();
  const { data: dashboard } = useGetCustomerDashboardQuery();
  const { data: wallet } = useGetWalletQuery();
  const { data: tx } = useGetWalletTransactionsQuery();
  const { data: packages } = useGetClientPackagesQuery();
  const { data: offers } = useGetClientOffersQuery();
  const { data: leadFlows } = useGetLeadFlowsQuery();
  const [createTopupSession, { isLoading: creatingTopup }] = useCreateTopupSessionMutation();
  const [upsertLeadFlow, { isLoading: savingFlow }] = useUpsertLeadFlowMutation();
  const [runLeadFlowsNow, { isLoading: runningFlows }] = useRunLeadFlowsNowMutation();
  const [topupAmount, setTopupAmount] = useState(50);
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

  const estimatedQty = useMemo(() => {
    if (!selectedPackage) return 1;
    return Math.max(1, Math.ceil((leadsPerWeek || 1) / selectedPackage.leads_count));
  }, [selectedPackage, leadsPerWeek]);

  const leadsReceived = dashboard?.totalLeads ?? 0;
  const totalSpent = useMemo(
    () =>
      (tx ?? [])
        .filter((t) => t.tx_type === "debit")
        .reduce((sum, row) => sum + Number(row.amount_cents || 0), 0),
    [tx]
  );
  const avgCpl = leadsReceived > 0 ? totalSpent / leadsReceived : 0;

  useEffect(() => {
    const topupState = searchParams.get("topup");
    if (topupState === "success") toast.success("Payment received. Wallet will update shortly.");
    if (topupState === "cancel") toast.info("Top-up canceled.");
  }, [searchParams]);

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
      toast.success(`Processed ${res.processed} lead flow(s).`);
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
                <Select value={activePackageId} onValueChange={setSelectedPackageId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select package" />
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
            <p className="text-xs text-muted-foreground">
              Estimated package quantity: {estimatedQty}
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
                ? "Lead flow saves recurring intent. Use run-now to execute due flows from wallet."
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
                  <div key={flow.id} className="flex items-center justify-between text-sm">
                    <span>
                      {flow.lead_packages?.name ?? "Package"} - {flow.leads_per_week}/week
                    </span>
                    <Badge className="bg-emerald-500/15 text-emerald-300">Active</Badge>
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
