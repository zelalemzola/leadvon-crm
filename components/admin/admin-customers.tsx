"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useGetFlowCommitmentsOverviewQuery,
  useGetCustomersQuery,
  useGetPendingCustomerUsersQuery,
  useLinkPendingCustomerOrganizationMutation,
  useCreateCustomerMutation,
  useGetCategoriesQuery,
  useGetOrganizationPricingOverridesQuery,
  useUpsertOrganizationPricingOverrideMutation,
  useGetOrganizationFreeDeliveryQuery,
  useUpsertOrganizationFreeDeliveryMutation,
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
import { Switch } from "@/components/ui/switch";
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
import { AlertTriangle, Building2, Clock3, Download, Gauge, Gift, MoreHorizontal, Plus, Users, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { cn, formatQueryError } from "@/lib/utils";
import { useI18n } from "@/components/providers/i18n-provider";

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
  const { t } = useI18n();
  const { data: customers, isLoading, isError, error } = useGetCustomersQuery();
  const {
    data: pendingUsers,
    isLoading: pendingLoading,
    isError: pendingError,
    error: pendingErrorObj,
  } = useGetPendingCustomerUsersQuery();
  const [linkPendingOrg, { isLoading: linkingPendingOrg }] =
    useLinkPendingCustomerOrganizationMutation();
  const [createCustomer, { isLoading: creatingCustomer }] = useCreateCustomerMutation();
  const { data: categories } = useGetCategoriesQuery();
  const [upsertPricingOverride, { isLoading: savingPricing }] =
    useUpsertOrganizationPricingOverrideMutation();
  const [upsertFreeDelivery, { isLoading: savingFreeDelivery }] =
    useUpsertOrganizationFreeDeliveryMutation();
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
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkProfileId, setLinkProfileId] = useState<string | null>(null);
  const [linkProfileEmail, setLinkProfileEmail] = useState<string>("");
  const [linkOrgName, setLinkOrgName] = useState("");
  const [linkPhone, setLinkPhone] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createFullName, setCreateFullName] = useState("");
  const [createOrgName, setCreateOrgName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [pricingOpen, setPricingOpen] = useState(false);
  const [pricingOrgId, setPricingOrgId] = useState<string | null>(null);
  const [pricingOrgName, setPricingOrgName] = useState("");
  const [singlePriceCents, setSinglePriceCents] = useState("");
  const [familyPriceCents, setFamilyPriceCents] = useState("");
  const [freeDeliveryOpen, setFreeDeliveryOpen] = useState(false);
  const [freeDeliveryOrgId, setFreeDeliveryOrgId] = useState<string | null>(null);
  const [freeDeliveryOrgName, setFreeDeliveryOrgName] = useState("");
  const [freeDeliveryTotal, setFreeDeliveryTotal] = useState("20");
  const [freeDeliveryActive, setFreeDeliveryActive] = useState(true);
  const [flowDrafts, setFlowDrafts] = useState<
    Record<string, { leads_per_week: number; monthly_target_leads: number; business_days_only: boolean }>
  >({});
  const {
    data: orgFlows,
    isFetching: flowsLoading,
    isError: flowsError,
    error: flowsErrorObj,
  } = useGetOrganizationFlowCommitmentsQuery(paceOrgId ?? "", { skip: !paceOpen || !paceOrgId });
  const { data: pricingOverrides } = useGetOrganizationPricingOverridesQuery(pricingOrgId ?? "", {
    skip: !pricingOpen || !pricingOrgId,
  });
  const { data: freeDeliverySettings } = useGetOrganizationFreeDeliveryQuery(
    freeDeliveryOrgId ?? "",
    { skip: !freeDeliveryOpen || !freeDeliveryOrgId }
  );

  const debtReviewCategory = (categories ?? []).find((c) => c.slug === "debt-review") ?? categories?.[0];

  useEffect(() => {
    if (!pricingOpen || !pricingOverrides) return;
    const single = pricingOverrides.find((row) => row.unit_type === "single");
    const family = pricingOverrides.find((row) => row.unit_type === "family");
    setSinglePriceCents(single ? String(single.price_cents) : "");
    setFamilyPriceCents(family ? String(family.price_cents) : "");
  }, [pricingOpen, pricingOverrides]);

  useEffect(() => {
    if (!freeDeliveryOpen) return;
    if (freeDeliverySettings) {
      setFreeDeliveryTotal(String(freeDeliverySettings.quota_total || 20));
      setFreeDeliveryActive(freeDeliverySettings.is_active);
    } else {
      setFreeDeliveryTotal("20");
      setFreeDeliveryActive(true);
    }
  }, [freeDeliveryOpen, freeDeliverySettings]);

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
    toast.success(t("adminCustomers.exportedCsv"));
  }

  async function copyEmail(email: string | null) {
    if (!email?.trim()) {
      toast.error(t("adminCustomers.noEmail"));
      return;
    }
    try {
      await navigator.clipboard.writeText(email);
      toast.success(t("adminCustomers.emailCopied"));
    } catch {
      toast.error(t("adminCustomers.couldNotCopy"));
    }
  }

  function openPaceDialog(row: CustomerDirectoryRow) {
    setPaceOrgId(row.organization_id);
    setPaceOrgName(row.organizations?.name ?? t("adminCustomers.customerOrganization"));
    setPaceOpen(true);
  }

  function openLinkDialog(user: {
    id: string;
    email: string | null;
    full_name: string | null;
  }) {
    setLinkProfileId(user.id);
    setLinkProfileEmail(user.email ?? "");
    const seedName =
      user.full_name?.trim() ||
      user.email?.split("@")[0]?.replaceAll(".", " ").replaceAll("_", " ") ||
      "Customer";
    setLinkOrgName(`${seedName} Organization`);
    setLinkPhone("");
    setLinkOpen(true);
  }

  async function submitCreateCustomer() {
    if (!createEmail.trim() || !createPassword.trim() || !createFullName.trim() || !createOrgName.trim()) {
      toast.error("Email, password, full name, and organization name are required.");
      return;
    }
    try {
      await createCustomer({
        email: createEmail.trim(),
        password: createPassword,
        full_name: createFullName.trim(),
        organization_name: createOrgName.trim(),
        phone: createPhone.trim() || null,
      }).unwrap();
      toast.success("Customer account created.");
      setCreateOpen(false);
      setCreateEmail("");
      setCreatePassword("");
      setCreateFullName("");
      setCreateOrgName("");
      setCreatePhone("");
    } catch (err: unknown) {
      toast.error(formatQueryError(err));
    }
  }

  function openPricingDialog(row: CustomerDirectoryRow) {
    setPricingOrgId(row.organization_id);
    setPricingOrgName(row.organizations?.name ?? "Customer");
    setPricingOpen(true);
  }

  async function submitPricingOverrides() {
    if (!pricingOrgId || !debtReviewCategory) {
      toast.error("Debt Review category is not configured.");
      return;
    }
    const single = singlePriceCents.trim() ? Number(singlePriceCents) : null;
    const family = familyPriceCents.trim() ? Number(familyPriceCents) : null;
    if (single !== null && (!Number.isInteger(single) || single < 0)) {
      toast.error("Single lead price must be a non-negative integer (cents).");
      return;
    }
    if (family !== null && (!Number.isInteger(family) || family < 0)) {
      toast.error("Family lead price must be a non-negative integer (cents).");
      return;
    }
    if (single === null && family === null) {
      toast.error("Enter at least one custom price.");
      return;
    }
    try {
      const tasks = [];
      if (single !== null) {
        tasks.push(
          upsertPricingOverride({
            organization_id: pricingOrgId,
            category_id: debtReviewCategory.id,
            unit_type: "single",
            price_cents: single,
            active: true,
          }).unwrap()
        );
      }
      if (family !== null) {
        tasks.push(
          upsertPricingOverride({
            organization_id: pricingOrgId,
            category_id: debtReviewCategory.id,
            unit_type: "family",
            price_cents: family,
            active: true,
          }).unwrap()
        );
      }
      await Promise.all(tasks);
      toast.success("Custom pricing saved.");
      setPricingOpen(false);
    } catch (err: unknown) {
      toast.error(formatQueryError(err));
    }
  }

  function openFreeDeliveryDialog(row: CustomerDirectoryRow) {
    setFreeDeliveryOrgId(row.organization_id);
    setFreeDeliveryOrgName(row.organizations?.name ?? "Customer");
    setFreeDeliveryOpen(true);
  }

  async function submitFreeDelivery() {
    if (!freeDeliveryOrgId) return;
    const total = Number(freeDeliveryTotal);
    if (!Number.isInteger(total) || total < 1) {
      toast.error("Total free leads must be at least 1.");
      return;
    }
    try {
      await upsertFreeDelivery({
        organization_id: freeDeliveryOrgId,
        quota_total: total,
        is_active: freeDeliveryActive,
      }).unwrap();
      toast.success(
        freeDeliveryActive
          ? "Free leads delivery saved. Leads will be delivered until the total is reached, then it turns off automatically."
          : "Free leads delivery settings saved."
      );
      setFreeDeliveryOpen(false);
    } catch (err: unknown) {
      toast.error(formatQueryError(err));
    }
  }

  async function submitLinkOrganization() {
    if (!linkProfileId) return;
    if (!linkOrgName.trim()) {
      toast.error("Organization name is required.");
      return;
    }
    try {
      await linkPendingOrg({
        profile_id: linkProfileId,
        organization_name: linkOrgName.trim(),
        phone: linkPhone.trim() || null,
      }).unwrap();
      toast.success("Organization linked successfully.");
      setLinkOpen(false);
      setLinkProfileId(null);
    } catch (err: unknown) {
      toast.error(formatQueryError(err));
    }
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
      toast.success(t("adminCustomers.deliveryCommitmentSaved"));
    } catch (err: unknown) {
      toast.error(formatQueryError(err));
    }
  }

  if (isError) {
    return (
      <div className="p-8">
        <p className="text-destructive">
          {t("adminCustomers.failedToLoad")} {formatQueryError(error)}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-8 p-6 lg:p-8">
      <header className="space-y-1">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("adminCustomers.title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("adminCustomers.subtitle")}
            </p>
          </div>
          <Button className="shrink-0 gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden />
            Create customer account
          </Button>
        </div>
      </header>

      <Card className="border-border/80 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">{t("adminCustomers.deliveryHealth")}</CardTitle>
          <CardDescription>
            {t("adminCustomers.deliveryHealthDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4">
              <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Building2 className="size-4 text-emerald-300" />
                {t("adminCustomers.activeLeadFlows")}
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{flowOverview?.activeFlows ?? 0}</p>
            </div>
            <div className="rounded-lg border border-sky-500/25 bg-sky-500/5 p-4">
              <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Clock3 className="size-4 text-sky-300" />
                {t("adminCustomers.queuedForDelivery")}
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
                {t("adminCustomers.deliveredVsAccrued")}
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {flowOverview?.deliveredThisMonth ?? 0} / {flowOverview?.accruedThisMonth ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">{deliveryPacePct}% {t("adminCustomers.pace")}</p>
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
                {t("adminCustomers.flowsBehindPace")}
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{flowOverview?.behindFlows ?? 0}</p>
              <p className="text-xs text-muted-foreground">
                {t("adminCustomers.targetMonthTotal")}: {flowOverview?.monthlyTargetLeads ?? 0}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">Pending customer accounts</CardTitle>
          <CardDescription>
            Signed-up users with no organization link yet. If users are missing from directory, check here first.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {pendingLoading ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : pendingError ? (
            <div className="p-6 text-sm text-destructive">
              Failed to load pending users: {formatQueryError(pendingErrorObj)}
            </div>
          ) : (pendingUsers?.length ?? 0) === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No pending customer accounts.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(pendingUsers ?? []).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name ?? "N/A"}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email ?? "N/A"}</TableCell>
                    <TableCell className="text-muted-foreground">{u.role}</TableCell>
                    <TableCell>
                      {u.is_active ? (
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
                      {new Date(u.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openLinkDialog(u)}
                      >
                        Link organization
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/50">
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">{t("adminCustomers.directory")}</CardTitle>
              <CardDescription>
                {t("adminCustomers.directoryDesc")}
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
              {t("adminCustomers.exportCsv")}
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-3 pt-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("adminCustomers.search")}</Label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("adminCustomers.searchPlaceholder")}
                className="w-[260px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("adminCustomers.status")}</Label>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as StatusFilter)}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("adminCustomers.all")}</SelectItem>
                  <SelectItem value="active">{t("adminCustomers.active")}</SelectItem>
                  <SelectItem value="inactive">{t("adminCustomers.inactive")}</SelectItem>
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
                  <TableHead className="w-[100px]">{t("adminCustomers.orgId")}</TableHead>
                  <CustomerSortHead
                    label={t("adminCustomers.organization")}
                    column="org"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <CustomerSortHead
                    label={t("adminCustomers.primaryContact")}
                    column="contact"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <TableHead>{t("adminCustomers.phone")}</TableHead>
                  <CustomerSortHead
                    label={t("adminCustomers.members")}
                    column="members"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <CustomerSortHead
                    label={t("adminCustomers.purchasedLeads")}
                    column="leads"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <TableHead>{t("adminCustomers.status")}</TableHead>
                  <CustomerSortHead
                    label={t("adminCustomers.joined")}
                    column="joined"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <TableHead className="text-right">{t("adminCustomers.actions")}</TableHead>
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
                        ? t("adminCustomers.noClientOrganizations")
                        : t("adminCustomers.noRowsMatch")}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSorted.map((row) => (
                    <TableRow key={row.organization_id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {row.organization_id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate font-medium">
                        {row.organizations?.name ?? t("admin.dashboard.na")}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <div>{row.primary_admin_name ?? t("admin.dashboard.na")}</div>
                        <div className="text-xs">{row.primary_admin_email ?? t("admin.dashboard.na")}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.phone ?? t("admin.dashboard.na")}
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-sky-500/15 text-sky-300 hover:bg-sky-500/25">
                          <Users className="mr-1 size-3" />
                          {row.membersCount} ({row.activeMembersCount} {t("adminCustomers.active")})
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {row.leadsPurchasedCount}
                      </TableCell>
                      <TableCell>
                        {typeof row.is_active !== "boolean" ? (
                          <Badge className="bg-amber-500/15 text-amber-300 hover:bg-amber-500/25">
                            {t("adminCustomers.unknown")}
                          </Badge>
                        ) : row.is_active ? (
                          <Badge className="bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25">
                            {t("adminCustomers.active")}
                          </Badge>
                        ) : (
                          <Badge className="bg-rose-500/15 text-rose-300 hover:bg-rose-500/25">
                            {t("adminCustomers.inactive")}
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
                              aria-label={t("adminCustomers.customerActions")}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => void copyEmail(row.primary_admin_email)}
                            >
                              {t("adminCustomers.copyEmail")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => openPaceDialog(row)}
                            >
                              {t("adminCustomers.manageDeliveryPace")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openPricingDialog(row)}>
                              <DollarSign className="mr-2 size-4" />
                              Custom pricing
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openFreeDeliveryDialog(row)}>
                              <Gift className="mr-2 size-4" />
                              Free leads delivery
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
            <DialogTitle>{t("adminCustomers.deliveryPaceCommitments")}</DialogTitle>
            <DialogDescription>
              {t("adminCustomers.configureTargets")} {paceOrgName}.
            </DialogDescription>
          </DialogHeader>
          {flowsError ? (
            <p className="text-sm text-destructive">{t("adminCustomers.failedToLoadFlows")} {formatQueryError(flowsErrorObj)}</p>
          ) : flowsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (orgFlows ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("adminCustomers.noLeadFlowsYet")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("adminCustomers.package")}</TableHead>
                  <TableHead>{t("adminCustomers.queue")}</TableHead>
                  <TableHead>{t("adminCustomers.paceCol")}</TableHead>
                  <TableHead>{t("adminCustomers.leadsPerWeek")}</TableHead>
                  <TableHead>{t("adminCustomers.monthlyTarget")}</TableHead>
                  <TableHead>{t("adminCustomers.businessDaysOnly")}</TableHead>
                  <TableHead className="text-right">{t("adminCustomers.save")}</TableHead>
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
                        {packageName ?? t("adminCustomers.package")}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {flow.pending_delivery_leads ?? 0}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {delivered} / {target}
                        {accrued > 0 ? ` (${Math.min(100, pct)}% ${t("adminCustomers.ofAccruedDue")})` : ""}
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
                            {pct >= 90 ? t("adminCustomers.onTrack") : pct >= 70 ? t("adminCustomers.watch") : t("adminCustomers.behind")}
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
                            <SelectItem value="yes">{t("adminCustomers.yes")}</SelectItem>
                            <SelectItem value="no">{t("adminCustomers.no")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => void saveFlowCommitment(flow.id)}
                          disabled={savingCommitment}
                        >
                          {t("adminCustomers.save")}
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
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create customer account</DialogTitle>
            <DialogDescription>
              Create the organization and customer admin login. The client will not need to sign up.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Full name</Label>
              <Input value={createFullName} onChange={(e) => setCreateFullName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Password</Label>
              <Input
                type="password"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                minLength={8}
              />
            </div>
            <div className="space-y-1">
              <Label>Organization name</Label>
              <Input value={createOrgName} onChange={(e) => setCreateOrgName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Phone (optional)</Label>
              <Input value={createPhone} onChange={(e) => setCreatePhone(e.target.value)} />
            </div>
            <div className="flex justify-end">
              <Button onClick={() => void submitCreateCustomer()} disabled={creatingCustomer}>
                {creatingCustomer ? "Creating..." : "Create account"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={pricingOpen} onOpenChange={setPricingOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Custom pricing</DialogTitle>
            <DialogDescription>
              Set per-lead prices for {pricingOrgName}. Leave blank to use global tiered pricing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Category</Label>
              <Input value={debtReviewCategory?.name ?? "Debt Review"} disabled />
            </div>
            <div className="space-y-1">
              <Label>Single lead price (cents)</Label>
              <Input
                type="number"
                min={0}
                value={singlePriceCents}
                onChange={(e) => setSinglePriceCents(e.target.value)}
                placeholder="e.g. 2500"
              />
            </div>
            <div className="space-y-1">
              <Label>Family lead price (cents)</Label>
              <Input
                type="number"
                min={0}
                value={familyPriceCents}
                onChange={(e) => setFamilyPriceCents(e.target.value)}
                placeholder="e.g. 4000"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={() => void submitPricingOverrides()} disabled={savingPricing}>
                {savingPricing ? "Saving..." : "Save pricing"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={freeDeliveryOpen} onOpenChange={setFreeDeliveryOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Free leads delivery</DialogTitle>
            <DialogDescription>
              Set how many free leads {freeDeliveryOrgName} should receive. Only inventory from the
              campaign start day onward is used. After turning delivery on, the system waits 5 minutes
              before assigning leads so you can enable other customers first for a fair split. Delivery
              turns off automatically when the total is reached; toggle on again later to start a new
              campaign.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Total free leads to deliver</Label>
              <Input
                type="number"
                min={1}
                value={freeDeliveryTotal}
                onChange={(e) => setFreeDeliveryTotal(e.target.value)}
              />
            </div>
            {freeDeliverySettings && freeDeliverySettings.quota_total > 0 ? (
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>
                  Delivered: {freeDeliverySettings.quota_delivered} / {freeDeliverySettings.quota_total}
                  {freeDeliverySettings.quota_delivered < freeDeliverySettings.quota_total
                    ? ` · Remaining: ${freeDeliverySettings.quota_total - freeDeliverySettings.quota_delivered}`
                    : " · Complete"}
                </p>
                {freeDeliverySettings.eligible_from ? (
                  <p>
                    Campaign inventory from:{" "}
                    {new Date(freeDeliverySettings.eligible_from).toLocaleDateString()}
                  </p>
                ) : null}
                {freeDeliverySettings.is_active &&
                freeDeliverySettings.distribute_after &&
                new Date(freeDeliverySettings.distribute_after) > new Date() ? (
                  <p>
                    Distribution starts:{" "}
                    {new Date(freeDeliverySettings.distribute_after).toLocaleString()}
                  </p>
                ) : null}
              </div>
            ) : freeDeliverySettings ? (
              <p className="text-sm text-muted-foreground">Not configured yet — set a total and save.</p>
            ) : null}
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="free-delivery-active" className="text-sm font-medium">
                  Free leads delivery
                </Label>
                <p className="text-xs text-muted-foreground">
                  {freeDeliveryActive
                    ? "On — leads assign automatically after the 5-minute setup window until the total is delivered."
                    : "Off — no free leads will be assigned."}
                </p>
              </div>
              <Switch
                id="free-delivery-active"
                checked={freeDeliveryActive}
                onCheckedChange={setFreeDeliveryActive}
                aria-label="Toggle free leads delivery"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={() => void submitFreeDelivery()} disabled={savingFreeDelivery}>
                {savingFreeDelivery ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Link pending customer to organization</DialogTitle>
            <DialogDescription>
              Create an organization and attach it to this customer profile.
              {linkProfileEmail ? ` (${linkProfileEmail})` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Organization name</Label>
              <Input
                value={linkOrgName}
                onChange={(e) => setLinkOrgName(e.target.value)}
                placeholder="Acme Insurance LLC"
              />
            </div>
            <div className="space-y-1">
              <Label>Phone (optional)</Label>
              <Input
                value={linkPhone}
                onChange={(e) => setLinkPhone(e.target.value)}
                placeholder="+1 555 010 2233"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={() => void submitLinkOrganization()} disabled={linkingPendingOrg}>
                {linkingPendingOrg ? "Linking..." : "Link organization"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
