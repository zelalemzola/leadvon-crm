"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useGetFlowCommitmentsOverviewQuery,
  useGetCustomersQuery,
  useGetOrganizationFlowCommitmentsQuery,
  useUpsertOrganizationFlowCommitmentMutation,
} from "@/lib/api/admin-api";
import type { CustomerDirectoryRow } from "@/types/database";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, Building2, Clock3, Download, Gauge, MoreHorizontal, Users } from "lucide-react";
import { toast } from "sonner";
import { cn, formatQueryError } from "@/lib/utils";

type StatusFilter = "all" | "active" | "inactive";
type SortKey = "joined" | "org" | "contact" | "members" | "leads";
type SortDir = "asc" | "desc";

function CustomerSortHead({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (column: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === column;
  return (
    <TableHead className={cn(className)}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1 font-medium hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {label}
        {active && (
          <span className="text-xs tabular-nums" aria-hidden>
            {sortDir === "asc" ? "↑" : "↓"}
          </span>
        )}
      </button>
    </TableHead>
  );
}

function sortCustomers(
  rows: CustomerDirectoryRow[],
  key: SortKey,
  dir: SortDir
): CustomerDirectoryRow[] {
  const m = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let va: string | number;
    let vb: string | number;
    switch (key) {
      case "joined":
        va = new Date(a.created_at).getTime();
        vb = new Date(b.created_at).getTime();
        break;
      case "org":
        va = (a.organizations?.name ?? "").toLowerCase();
        vb = (b.organizations?.name ?? "").toLowerCase();
        break;
      case "contact":
        va = `${a.primary_admin_name ?? ""} ${a.primary_admin_email ?? ""}`.toLowerCase();
        vb = `${b.primary_admin_name ?? ""} ${b.primary_admin_email ?? ""}`.toLowerCase();
        break;
      case "members":
        va = a.membersCount;
        vb = b.membersCount;
        break;
      case "leads":
        va = a.leadsPurchasedCount;
        vb = b.leadsPurchasedCount;
        break;
      default:
        return 0;
    }
    if (va < vb) return -1 * m;
    if (va > vb) return 1 * m;
    return 0;
  });
}

export function AdminCustomers() {
  const { data: customers, isLoading, isError, error } = useGetCustomersQuery();
  const { data: flowOverview } = useGetFlowCommitmentsOverviewQuery();
  const [upsertFlowCommitment, { isLoading: savingCommitment }] =
    useUpsertOrganizationFlowCommitmentMutation();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("joined");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [paceOpen, setPaceOpen] = useState(false);
  const [paceOrgId, setPaceOrgId] = useState<string | null>(null);
  const [paceOrgName, setPaceOrgName] = useState<string>("");
  const [flowDrafts, setFlowDrafts] = useState<
    Record<string, { leads_per_week: number; monthly_target_leads: number; business_days_only: boolean }>
  >({});
  const {
    data: orgFlows,
    isFetching: flowsLoading,
    isError: flowsError,
    error: flowsErrorObj,
  } = useGetOrganizationFlowCommitmentsQuery(paceOrgId ?? "", { skip: !paceOpen || !paceOrgId });

  useEffect(() => {
    if (!paceOpen) return;
    const next: Record<
      string,
      { leads_per_week: number; monthly_target_leads: number; business_days_only: boolean }
    > = {};
    for (const flow of orgFlows ?? []) {
      const existing = flow.customer_flow_commitments?.[0];
      next[flow.id] = {
        leads_per_week: flow.leads_per_week,
        monthly_target_leads:
          existing?.monthly_target_leads ?? Math.max(1, Math.ceil(flow.leads_per_week * 4.33)),
        business_days_only: existing?.business_days_only ?? true,
      };
    }
    setFlowDrafts(next);
  }, [orgFlows, paceOpen]);

  const filteredSorted = useMemo(() => {
    let list = customers ?? [];

    if (statusFilter === "active") {
      list = list.filter((c) => c.is_active === true);
    } else if (statusFilter === "inactive") {
      list = list.filter((c) => c.is_active === false);
    }

    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter((c) => {
        const orgName = (c.organizations?.name ?? "").toLowerCase();
        return (
          (c.primary_admin_email ?? "").toLowerCase().includes(term) ||
          (c.primary_admin_name ?? "").toLowerCase().includes(term) ||
          c.organization_id.toLowerCase().includes(term) ||
          (c.phone ?? "").toLowerCase().includes(term) ||
          orgName.includes(term)
        );
      });
    }

    return sortCustomers(list, sortKey, sortDir);
  }, [customers, statusFilter, search, sortKey, sortDir]);

  function setSort(next: SortKey) {
    if (sortKey === next) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(next);
      setSortDir(next === "joined" || next === "leads" || next === "members" ? "desc" : "asc");
    }
  }

  const total = customers?.length ?? 0;
  const deliveryPacePct = flowOverview?.accruedThisMonth
    ? Math.min(
        100,
        Math.round((flowOverview.deliveredThisMonth / Math.max(1, flowOverview.accruedThisMonth)) * 100)
      )
    : 0;

  function exportCsv() {
    const headers = [
      "organization_id",
      "organization",
      "primary_admin",
      "primary_admin_email",
      "phone",
      "members",
      "active_members",
      "purchased_leads_org",
      "is_active",
      "created_at",
    ];
    const lines = filteredSorted.map((r) =>
      [
        r.organization_id,
        r.organizations?.name ?? "",
        r.primary_admin_name ?? "",
        r.primary_admin_email ?? "",
        r.phone ?? "",
        r.membersCount,
        r.activeMembersCount,
        r.leadsPurchasedCount,
        r.is_active,
        r.created_at,
      ]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(",")
    );
    const blob = new Blob([[headers.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "customers-export.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  }

  async function copyEmail(email: string | null) {
    if (!email?.trim()) {
      toast.error("No email on file");
      return;
    }
    try {
      await navigator.clipboard.writeText(email);
      toast.success("Email copied");
    } catch {
      toast.error("Could not copy");
    }
  }

  function openPaceDialog(row: CustomerDirectoryRow) {
    setPaceOrgId(row.organization_id);
    setPaceOrgName(row.organizations?.name ?? "Customer organization");
    setPaceOpen(true);
  }

  async function saveFlowCommitment(flowId: string) {
    if (!paceOrgId) return;
    const draft = flowDrafts[flowId];
    if (!draft) return;
    try {
      await upsertFlowCommitment({
        flow_id: flowId,
        organization_id: paceOrgId,
        leads_per_week: Math.max(1, draft.leads_per_week),
        monthly_target_leads: Math.max(1, draft.monthly_target_leads),
        business_days_only: draft.business_days_only,
      }).unwrap();
      toast.success("Delivery commitment saved");
    } catch (err: unknown) {
      toast.error(formatQueryError(err));
    }
  }

  if (isError) {
    return (
      <div className="p-8">
        <p className="text-destructive">
          Failed to load customers: {formatQueryError(error)}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-8 p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <p className="text-sm text-muted-foreground">
          Client organizations only (one row per company), with primary admin contact and delivery controls.
        </p>
      </header>

      <Card className="border-border/80 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">Delivery Health</CardTitle>
          <CardDescription>
            Real-time pacing overview across all active customer lead flows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4">
              <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Building2 className="size-4 text-emerald-300" />
                Active lead flows
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{flowOverview?.activeFlows ?? 0}</p>
            </div>
            <div className="rounded-lg border border-sky-500/25 bg-sky-500/5 p-4">
              <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Clock3 className="size-4 text-sky-300" />
                Queued for delivery
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{flowOverview?.queuedLeads ?? 0}</p>
            </div>
            <div
              className={cn(
                "rounded-lg border p-4",
                deliveryPacePct >= 90
                  ? "border-emerald-500/25 bg-emerald-500/5"
                  : deliveryPacePct >= 70
                    ? "border-amber-500/25 bg-amber-500/5"
                    : "border-rose-500/25 bg-rose-500/5"
              )}
            >
              <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Gauge
                  className={cn(
                    "size-4",
                    deliveryPacePct >= 90
                      ? "text-emerald-300"
                      : deliveryPacePct >= 70
                        ? "text-amber-300"
                        : "text-rose-300"
                  )}
                />
                Delivered vs accrued (month)
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {flowOverview?.deliveredThisMonth ?? 0} / {flowOverview?.accruedThisMonth ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">{deliveryPacePct}% pace</p>
            </div>
            <div
              className={cn(
                "rounded-lg border p-4",
                (flowOverview?.behindFlows ?? 0) === 0
                  ? "border-emerald-500/25 bg-emerald-500/5"
                  : (flowOverview?.behindFlows ?? 0) <= 3
                    ? "border-amber-500/25 bg-amber-500/5"
                    : "border-rose-500/25 bg-rose-500/5"
              )}
            >
              <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <AlertTriangle
                  className={cn(
                    "size-4",
                    (flowOverview?.behindFlows ?? 0) === 0
                      ? "text-emerald-300"
                      : (flowOverview?.behindFlows ?? 0) <= 3
                        ? "text-amber-300"
                        : "text-rose-300"
                  )}
                />
                Flows behind pace
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{flowOverview?.behindFlows ?? 0}</p>
              <p className="text-xs text-muted-foreground">
                Target month total: {flowOverview?.monthlyTargetLeads ?? 0}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/50">
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">Directory</CardTitle>
              <CardDescription>
                Purchased leads counts are per organization (shared by everyone in
                that org).
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-2"
              onClick={exportCsv}
              disabled={!filteredSorted.length}
            >
              <Download className="size-4" aria-hidden />
              Export CSV
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-3 pt-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Organization, contact email/name, phone, org id"
                className="w-[260px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as StatusFilter)}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Org ID</TableHead>
                  <CustomerSortHead
                    label="Organization"
                    column="org"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <CustomerSortHead
                    label="Primary Contact"
                    column="contact"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <TableHead>Phone</TableHead>
                  <CustomerSortHead
                    label="Members"
                    column="members"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <CustomerSortHead
                    label="Purchased leads"
                    column="leads"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <TableHead>Status</TableHead>
                  <CustomerSortHead
                    label="Joined"
                    column="joined"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSorted.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="h-24 text-center text-muted-foreground"
                    >
                      {total === 0
                        ? "No client organizations yet."
                        : "No rows match your filters or search."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSorted.map((row) => (
                    <TableRow key={row.organization_id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {row.organization_id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate font-medium">
                        {row.organizations?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <div>{row.primary_admin_name ?? "—"}</div>
                        <div className="text-xs">{row.primary_admin_email ?? "—"}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.phone ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-sky-500/15 text-sky-300 hover:bg-sky-500/25">
                          <Users className="mr-1 size-3" />
                          {row.membersCount} ({row.activeMembersCount} active)
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {row.leadsPurchasedCount}
                      </TableCell>
                      <TableCell>
                        {typeof row.is_active !== "boolean" ? (
                          <Badge className="bg-amber-500/15 text-amber-300 hover:bg-amber-500/25">
                            Unknown
                          </Badge>
                        ) : row.is_active ? (
                          <Badge className="bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25">
                            Active
                          </Badge>
                        ) : (
                          <Badge className="bg-rose-500/15 text-rose-300 hover:bg-rose-500/25">
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(row.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Customer actions"
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => void copyEmail(row.primary_admin_email)}
                            >
                              Copy email
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => openPaceDialog(row)}
                            >
                              Manage delivery pace
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Dialog open={paceOpen} onOpenChange={setPaceOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Delivery pace and commitments</DialogTitle>
            <DialogDescription>
              Configure monthly targets and business-day mode for active flows in {paceOrgName}.
            </DialogDescription>
          </DialogHeader>
          {flowsError ? (
            <p className="text-sm text-destructive">Failed to load flows: {formatQueryError(flowsErrorObj)}</p>
          ) : flowsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (orgFlows ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No lead flows found for this organization yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Package</TableHead>
                  <TableHead>Queue</TableHead>
                  <TableHead>Pace</TableHead>
                  <TableHead>Leads/week</TableHead>
                  <TableHead>Monthly target</TableHead>
                  <TableHead>Business days only</TableHead>
                  <TableHead className="text-right">Save</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(orgFlows ?? []).map((flow) => {
                  const d = flowDrafts[flow.id];
                  const packageName = Array.isArray(flow.lead_packages)
                    ? flow.lead_packages[0]?.name
                    : flow.lead_packages?.name;
                  const delivered = flow.delivered_this_month ?? 0;
                  const accrued = flow.accrued_this_month ?? 0;
                  const target =
                    d?.monthly_target_leads ??
                    flow.customer_flow_commitments?.[0]?.monthly_target_leads ??
                    Math.max(1, Math.ceil(flow.leads_per_week * 4.33));
                  const pct = accrued > 0 ? Math.round((delivered / accrued) * 100) : 0;
                  return (
                    <TableRow key={flow.id}>
                      <TableCell className="font-medium">
                        {packageName ?? "Package"}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {flow.pending_delivery_leads ?? 0}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {delivered} / {target}
                        {accrued > 0 ? ` (${Math.min(100, pct)}% of accrued due)` : ""}
                        {accrued > 0 ? (
                          <span
                            className={cn(
                              "ml-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                              pct >= 90
                                ? "bg-emerald-500/15 text-emerald-300"
                                : pct >= 70
                                  ? "bg-amber-500/15 text-amber-300"
                                  : "bg-rose-500/15 text-rose-300"
                            )}
                          >
                            {pct >= 90 ? "On track" : pct >= 70 ? "Watch" : "Behind"}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          className="w-28"
                          value={d?.leads_per_week ?? flow.leads_per_week}
                          onChange={(e) =>
                            setFlowDrafts((prev) => ({
                              ...prev,
                              [flow.id]: {
                                leads_per_week: Math.max(1, Number(e.target.value) || 1),
                                monthly_target_leads: prev[flow.id]?.monthly_target_leads ?? target,
                                business_days_only:
                                  prev[flow.id]?.business_days_only ??
                                  (flow.customer_flow_commitments?.[0]?.business_days_only ?? true),
                              },
                            }))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          className="w-32"
                          value={target}
                          onChange={(e) =>
                            setFlowDrafts((prev) => ({
                              ...prev,
                              [flow.id]: {
                                leads_per_week: prev[flow.id]?.leads_per_week ?? flow.leads_per_week,
                                monthly_target_leads: Math.max(1, Number(e.target.value) || 1),
                                business_days_only:
                                  prev[flow.id]?.business_days_only ??
                                  (flow.customer_flow_commitments?.[0]?.business_days_only ?? true),
                              },
                            }))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={
                            (d?.business_days_only ??
                              flow.customer_flow_commitments?.[0]?.business_days_only ??
                              true)
                              ? "yes"
                              : "no"
                          }
                          onValueChange={(v) =>
                            setFlowDrafts((prev) => ({
                              ...prev,
                              [flow.id]: {
                                leads_per_week: prev[flow.id]?.leads_per_week ?? flow.leads_per_week,
                                monthly_target_leads: prev[flow.id]?.monthly_target_leads ?? target,
                                business_days_only: v === "yes",
                              },
                            }))
                          }
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="yes">Yes</SelectItem>
                            <SelectItem value="no">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => void saveFlowCommitment(flow.id)}
                          disabled={savingCommitment}
                        >
                          Save
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
