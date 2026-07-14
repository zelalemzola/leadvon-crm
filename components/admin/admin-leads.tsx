"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Upload,
  Download,
  CreditCard,
  Gift,
  RefreshCcw,
} from "lucide-react";
import { toast } from "sonner";
import {
  useGetCategoriesQuery,
  useGetLeadsQuery,
  useGetCustomersQuery,
  useCreateLeadMutation,
  useImportCsvLeadsMutation,
  useUpdateLeadMutation,
  useDeleteLeadMutation,
  useDeliverPrepaidLeadMutation,
  useDeliverSignupFreeLeadMutation,
  useDeliverFreeLeadMutation,
  useSyncFunnelLeadsMutation,
  type AdminLeadsAvailability,
  type AdminLeadsSourceFilter,
  type AdminLeadsReviewStatusFilter,
  type AdminLeadsSort,
} from "@/lib/api/admin-api";
import { reviewStatusLabel, REVIEW_STATUS_OPTIONS } from "@/lib/integrations/review-status";
import type { LeadWithCategory } from "@/types/database";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { useI18n } from "@/components/providers/i18n-provider";
import {
  AdminTablePagination,
  ADMIN_PAGE_SIZE,
} from "@/components/admin/admin-table-pagination";
import {
  buildLeadCsvTemplateCsv,
  parseLeadCsvText,
  type LeadCsvParseResult,
} from "@/lib/imports/lead-csv";

const emptyForm = {
  category_id: "",
  lead_unit_type: "single" as "single" | "family",
  phone: "",
  first_name: "",
  last_name: "",
  country: "",
  summary: "",
  sold: false,
};

function normalizeLeadSource(source?: string | null) {
  return (source ?? "manual").trim().toLowerCase() || "manual";
}

function LeadSourceBadge({
  lead,
  t,
}: {
  lead: LeadWithCategory;
  t: (path: string) => string;
}) {
  const source = normalizeLeadSource(lead.source_system);
  if (source === "base44") {
    const externalId = lead.source_external_id?.trim();
    return (
      <Badge
        className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
        title={externalId ? `${t("adminLeads.sourceExternalId")}: ${externalId}` : undefined}
      >
        {t("adminLeads.sourceBase44")}
      </Badge>
    );
  }
  if (source === "funnel") {
    const externalId = lead.source_external_id?.trim();
    return (
      <Badge
        className="border-border bg-muted/50 text-foreground hover:bg-muted"
        title={externalId ? `${t("adminLeads.sourceFunnelId")}: ${externalId}` : undefined}
      >
        {t("adminLeads.sourceFunnel")}
      </Badge>
    );
  }
  if (source === "manual") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {t("adminLeads.sourceManual")}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {source}
    </Badge>
  );
}

export function AdminLeads() {
  const { localizePath, t } = useI18n();
  const [categoryFilter, setCategoryFilter] = useState<string | "all">("all");
  const [search, setSearch] = useState("");
  const [availabilityFilter, setAvailabilityFilter] =
    useState<AdminLeadsAvailability>("all");
  const [sourceFilter, setSourceFilter] = useState<AdminLeadsSourceFilter>("all");
  const [reviewStatusFilter, setReviewStatusFilter] =
    useState<AdminLeadsReviewStatusFilter>("all");
  const [countryFilter, setCountryFilter] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [sort, setSort] = useState<AdminLeadsSort>("newest");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [prepaidDialogOpen, setPrepaidDialogOpen] = useState(false);
  const [prepaidLead, setPrepaidLead] = useState<LeadWithCategory | null>(null);
  const [prepaidOrgId, setPrepaidOrgId] = useState("");
  const [signupFreeDialogOpen, setSignupFreeDialogOpen] = useState(false);
  const [signupFreeLead, setSignupFreeLead] = useState<LeadWithCategory | null>(null);
  const [signupFreeOrgId, setSignupFreeOrgId] = useState("");
  const [freeDialogOpen, setFreeDialogOpen] = useState(false);
  const [freeLead, setFreeLead] = useState<LeadWithCategory | null>(null);
  const [freeOrgId, setFreeOrgId] = useState("");
  const [summaryLead, setSummaryLead] = useState<LeadWithCategory | null>(null);
  const [editing, setEditing] = useState<LeadWithCategory | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [csvPreview, setCsvPreview] = useState<LeadCsvParseResult | null>(null);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const importRef = useRef<HTMLInputElement | null>(null);

  const { data: categories, isLoading: catLoading } = useGetCategoriesQuery();
  const { data: customers } = useGetCustomersQuery();
  const {
    data: leads,
    isLoading: leadsLoading,
    isError,
    error,
  } = useGetLeadsQuery({
    categoryId: categoryFilter === "all" ? undefined : categoryFilter,
    search,
    page,
    pageSize: 15,
    availability: availabilityFilter,
    source: sourceFilter,
    reviewStatus: reviewStatusFilter,
    country: countryFilter,
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
    sort,
  });

  const [createLead, { isLoading: creating }] = useCreateLeadMutation();
  const [importCsvLeads, { isLoading: importingCsv }] = useImportCsvLeadsMutation();
  const [updateLead, { isLoading: updating }] = useUpdateLeadMutation();
  const [deleteLead, { isLoading: deleting }] = useDeleteLeadMutation();
  const [deliverPrepaid, { isLoading: deliveringPrepaid }] =
    useDeliverPrepaidLeadMutation();
  const [deliverSignupFree, { isLoading: deliveringSignupFree }] =
    useDeliverSignupFreeLeadMutation();
  const [deliverFree, { isLoading: deliveringFree }] =
    useDeliverFreeLeadMutation();
  const [syncFunnelLeads, { isLoading: syncingFunnel }] =
    useSyncFunnelLeadsMutation();

  const loading = leadsLoading || catLoading;
  const rows = leads?.rows ?? [];
  const totalLeads = leads?.total ?? 0;
  const availableLeads = rows.filter((l) => !l.sold_at).length;
  const soldLeads = rows.length - availableLeads;

  const defaultCategoryId = useMemo(() => {
    return categories?.[0]?.id ?? "";
  }, [categories]);

  const orgChoices = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customers ?? []) {
      if (c.organization_id && c.organizations?.name) {
        map.set(c.organization_id, c.organizations.name);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [customers]);

  useEffect(() => {
    if (
      signupFreeDialogOpen &&
      !signupFreeOrgId &&
      orgChoices.length > 0
    ) {
      setSignupFreeOrgId(orgChoices[0][0]);
    }
  }, [signupFreeDialogOpen, signupFreeOrgId, orgChoices]);

  useEffect(() => {
    if (
      prepaidDialogOpen &&
      !prepaidOrgId &&
      orgChoices.length > 0
    ) {
      setPrepaidOrgId(orgChoices[0][0]);
    }
  }, [prepaidDialogOpen, prepaidOrgId, orgChoices]);

  useEffect(() => {
    if (freeDialogOpen && !freeOrgId && orgChoices.length > 0) {
      setFreeOrgId(orgChoices[0][0]);
    }
  }, [freeDialogOpen, freeOrgId, orgChoices]);

  function openCreate() {
    setEditing(null);
    setForm({
      ...emptyForm,
      category_id: defaultCategoryId,
    });
    setDialogOpen(true);
  }

  function openEdit(row: LeadWithCategory) {
    setEditing(row);
    setForm({
      category_id: row.category_id,
      lead_unit_type: row.lead_unit_type ?? "single",
      phone: row.phone,
      first_name: row.first_name,
      last_name: row.last_name,
      country: row.country ?? "",
      summary: row.summary ?? "",
      sold: Boolean(row.sold_at),
    });
    setDialogOpen(true);
  }

  function openPrepaidDeliver(row: LeadWithCategory) {
    setPrepaidLead(row);
    setPrepaidOrgId(orgChoices[0]?.[0] ?? "");
    setPrepaidDialogOpen(true);
  }

  function openSignupFreeDeliver(row: LeadWithCategory) {
    setSignupFreeLead(row);
    setSignupFreeOrgId(orgChoices[0]?.[0] ?? "");
    setSignupFreeDialogOpen(true);
  }

  function openFreeDeliver(row: LeadWithCategory) {
    setFreeLead(row);
    setFreeOrgId(orgChoices[0]?.[0] ?? "");
    setFreeDialogOpen(true);
  }

  async function handlePrepaidDeliver(e: React.FormEvent) {
    e.preventDefault();
    if (!prepaidLead || !prepaidOrgId) {
      toast.error(t("adminLeads.selectOrganization"));
      return;
    }
    try {
      const res = await deliverPrepaid({
        organization_id: prepaidOrgId,
        source_lead_id: prepaidLead.id,
      }).unwrap();
      toast.success(
        `${t("adminLeads.deliveredToCustomer")} $${(res.amount_cents / 100).toFixed(2)} ${t("adminLeads.fromPrepaidBudget")}`
      );
      setPrepaidDialogOpen(false);
      setPrepaidLead(null);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: { message?: string } }).data)
          : t("adminLeads.deliveryFailed");
      toast.error(msg);
    }
  }

  async function handleSignupFreeDeliver(e: React.FormEvent) {
    e.preventDefault();
    if (!signupFreeLead || !signupFreeOrgId) {
      toast.error(t("adminLeads.selectOrganization"));
      return;
    }
    try {
      await deliverSignupFree({
        organization_id: signupFreeOrgId,
        source_lead_id: signupFreeLead.id,
      }).unwrap();
      toast.success(t("adminLeads.deliveredToCustomerForFree"));
      setSignupFreeDialogOpen(false);
      setSignupFreeLead(null);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: { message?: string } }).data)
          : t("adminLeads.deliveryFailed");
      toast.error(msg);
    }
  }

  async function handleFreeDeliver(e: React.FormEvent) {
    e.preventDefault();
    if (!freeLead || !freeOrgId) {
      toast.error(t("adminLeads.selectOrganization"));
      return;
    }
    try {
      await deliverFree({
        organization_id: freeOrgId,
        source_lead_id: freeLead.id,
      }).unwrap();
      toast.success(t("adminLeads.deliveredToCustomerFree"));
      setFreeDialogOpen(false);
      setFreeLead(null);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: { message?: string } }).data)
          : t("adminLeads.deliveryFailed");
      toast.error(msg);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.category_id) {
      toast.error(t("adminLeads.selectCategoryFirst"));
      return;
    }
    const payload = {
      category_id: form.category_id,
      lead_unit_type: form.lead_unit_type,
      phone: form.phone.trim(),
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      country: form.country.trim(),
      summary: form.summary.trim(),
      sold_at: form.sold ? new Date().toISOString() : null,
    };

    try {
      if (editing) {
        await updateLead({
          id: editing.id,
          ...payload,
        }).unwrap();
        toast.success(t("adminLeads.leadUpdated"));
      } else {
        await createLead({
          category_id: payload.category_id,
          lead_unit_type: payload.lead_unit_type,
          phone: payload.phone,
          first_name: payload.first_name,
          last_name: payload.last_name,
          country: payload.country,
          summary: payload.summary,
          sold_at: payload.sold_at,
        }).unwrap();
        toast.success(t("adminLeads.leadCreated"));
      }
      setDialogOpen(false);
      setForm(emptyForm);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: { message?: string } }).data)
          : t("adminLeads.requestFailed");
      toast.error(msg);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("adminLeads.confirmDelete"))) return;
    try {
      await deleteLead(id).unwrap();
      toast.success(t("adminLeads.leadDeleted"));
    } catch {
      toast.error(t("adminLeads.couldNotDelete"));
    }
  }

  async function handleSyncFunnelLeads() {
    try {
      const res = await syncFunnelLeads().unwrap();
      toast.success(
        `${t("adminLeads.syncFunnelDone")} ${res.fetched} ${t("adminLeads.fetched")}, ${res.inserted} ${t("adminLeads.inserted")}, ${res.updated} ${t("adminLeads.updated")}, ${res.skipped_invalid} ${t("adminLeads.skipped")}`
      );
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: { message?: string } }).data)
          : t("adminLeads.syncFunnelFailed");
      toast.error(msg);
    }
  }

  function exportCsv() {
    const headers = [
      "id",
      "first_name",
      "last_name",
      "phone",
      "zip_code",
      "country",
      "lead_unit_type",
      "category",
      "summary",
      "review_status",
      "source_system",
      "status",
      "created_at",
    ];
    const lines = rows.map((r) =>
      [
        r.id,
        r.first_name,
        r.last_name,
        r.phone,
        r.zip_code ?? "",
        r.country ?? "",
        r.lead_unit_type ?? "single",
        r.categories?.name ?? "",
        (r.summary ?? "").replaceAll('"', '""'),
        reviewStatusLabel(r.review_status),
        normalizeLeadSource(r.source_system),
        r.sold_at ? "sold" : "available",
        r.created_at,
      ]
        .map((v) => `"${String(v)}"`)
        .join(",")
    );
    const blob = new Blob([[headers.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadCsvTemplate() {
    const blob = new Blob([buildLeadCsvTemplateCsv()], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCsvFileSelected(file: File) {
    const text = await file.text();
    if (!text.trim()) {
      toast.error(t("adminLeads.csvEmpty"));
      return;
    }

    const result = parseLeadCsvText(
      text,
      (categories ?? []).map((c) => ({ id: c.id, name: c.name, slug: c.slug }))
    );

    if (result.fileErrors.length > 0) {
      toast.error(result.fileErrors[0] ?? t("adminLeads.csvImportFailed"));
      return;
    }

    setCsvPreview(result);
    setCsvImportOpen(true);
  }

  async function confirmCsvImport() {
    if (!csvPreview || csvPreview.validRows.length === 0) return;

    try {
      const result = await importCsvLeads({
        rows: csvPreview.validRows.map((row) => ({
          category_id: row.category_id,
          lead_unit_type: row.lead_unit_type,
          phone: row.phone,
          first_name: row.first_name,
          last_name: row.last_name,
          country: row.country,
          summary: row.summary,
          zip_code: row.zip_code,
          review_status: row.review_status,
        })),
      }).unwrap();

      const failedCount = result.failed.length;
      if (failedCount > 0) {
        toast.warning(
          `${t("adminLeads.imported")} ${result.imported} ${t("adminLeads.leads")}. ${failedCount} ${t("adminLeads.csvRowsFailed")}.`
        );
      } else {
        toast.success(`${t("adminLeads.imported")} ${result.imported} ${t("adminLeads.leads")}`);
      }

      setCsvImportOpen(false);
      setCsvPreview(null);
    } catch {
      toast.error(t("adminLeads.csvImportFailed"));
    }
  }

  if (isError) {
    return (
      <div className="p-8">
        <p className="text-destructive">
          {t("adminLeads.failedToLoad")}{" "}
          {error && typeof error === "object" && "data" in error
            ? String((error as { data?: unknown }).data)
            : t("adminLeads.unknownError")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{t("adminLeads.title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("adminLeads.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={exportCsv}>
              <Download className="size-4" />
              {t("adminLeads.exportCsv")}
            </Button>
            <Button variant="outline" onClick={downloadCsvTemplate}>
              <Download className="size-4" />
              {t("adminLeads.downloadCsvTemplate")}
            </Button>
            <Button variant="outline" onClick={() => importRef.current?.click()}>
              <Upload className="size-4" />
              {t("adminLeads.importCsv")}
            </Button>
            <Button variant="outline" onClick={() => void handleSyncFunnelLeads()} disabled={syncingFunnel}>
              <RefreshCcw className="size-4" />
              {syncingFunnel ? t("adminLeads.syncingFunnel") : t("adminLeads.syncFunnel")}
            </Button>
            <input
              ref={importRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleCsvFileSelected(f);
                e.currentTarget.value = "";
              }}
            />
            <Button onClick={openCreate} disabled={!categories?.length}>
              <Plus className="size-4" aria-hidden />
              {t("adminLeads.newLead")}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("adminLeads.search")}</Label>
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t("adminLeads.searchPlaceholder")}
              className="w-[220px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("adminLeads.category")}</Label>
            <Select
              value={categoryFilter}
              onValueChange={(v) => {
                setCategoryFilter(v as typeof categoryFilter);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t("adminLeads.category")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("adminLeads.allCategories")}</SelectItem>
                {(categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("adminLeads.availability")}</Label>
            <Select
              value={availabilityFilter}
              onValueChange={(v) => {
                setAvailabilityFilter(v as AdminLeadsAvailability);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("adminLeads.all")}</SelectItem>
                <SelectItem value="available">{t("adminLeads.available")}</SelectItem>
                <SelectItem value="sold">{t("adminLeads.sold")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("adminLeads.source")}</Label>
            <Select
              value={sourceFilter}
              onValueChange={(v) => {
                setSourceFilter(v as AdminLeadsSourceFilter);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("adminLeads.allSources")}</SelectItem>
                <SelectItem value="manual">{t("adminLeads.sourceManual")}</SelectItem>
                <SelectItem value="base44">{t("adminLeads.sourceBase44")}</SelectItem>
                <SelectItem value="funnel">{t("adminLeads.sourceFunnel")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("adminLeads.reviewStatus")}</Label>
            <Select
              value={reviewStatusFilter}
              onValueChange={(v) => {
                setReviewStatusFilter(v as AdminLeadsReviewStatusFilter);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("adminLeads.allReviewStatuses")}</SelectItem>
                <SelectItem value="__none__">{t("adminLeads.reviewStatusUnset")}</SelectItem>
                {REVIEW_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("adminLeads.country")}</Label>
            <Input
              value={countryFilter}
              onChange={(e) => {
                setCountryFilter(e.target.value);
                setPage(1);
              }}
              placeholder={t("adminLeads.filterByCountry")}
              className="w-[160px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("adminLeads.createdFrom")}</Label>
            <Input
              type="date"
              value={createdFrom}
              onChange={(e) => {
                setCreatedFrom(e.target.value);
                setPage(1);
              }}
              className="w-[150px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("adminLeads.createdTo")}</Label>
            <Input
              type="date"
              value={createdTo}
              onChange={(e) => {
                setCreatedTo(e.target.value);
                setPage(1);
              }}
              className="w-[150px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("adminLeads.sort")}</Label>
            <Select
              value={sort}
              onValueChange={(v) => {
                setSort(v as AdminLeadsSort);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">{t("adminLeads.newestFirst")}</SelectItem>
                <SelectItem value="oldest">{t("adminLeads.oldestFirst")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      {!categories?.length ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">{t("adminLeads.noCategoriesYet")}</CardTitle>
            <CardDescription>
              {t("adminLeads.createCategoryUnder")}{" "}
              <Link href={localizePath("/admin/pricing")} className="text-primary underline">
                {t("admin.nav.pricing")}
              </Link>{" "}
              {t("adminLeads.beforeAddingLeads")}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border py-4">
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <Badge variant="outline" className="border-border text-foreground">
                {t("adminLeads.total")}: {totalLeads}
              </Badge>
              <Badge className="bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25">
                {t("adminLeads.availablePage")}: {availableLeads}
              </Badge>
              <Badge className="bg-rose-500/15 text-rose-300 hover:bg-rose-500/25">
                {t("adminLeads.soldPage")}: {soldLeads}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>{t("adminLeads.name")}</TableHead>
                    <TableHead>{t("adminLeads.phone")}</TableHead>
                    <TableHead>{t("adminLeads.zipCode")}</TableHead>
                    <TableHead>{t("adminLeads.country")}</TableHead>
                    <TableHead>{t("adminLeads.unit")}</TableHead>
                    <TableHead>{t("adminLeads.category")}</TableHead>
                    <TableHead>{t("adminLeads.source")}</TableHead>
                    <TableHead>{t("adminLeads.reviewStatus")}</TableHead>
                    <TableHead>{t("adminLeads.summary")}</TableHead>
                    <TableHead>{t("adminLeads.created")}</TableHead>
                    <TableHead>{t("adminLeads.status")}</TableHead>
                    <TableHead className="text-right">{t("adminLeads.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={13} className="h-24 text-center">
                        {t("adminLeads.noLeadsMatch")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {row.id.slice(0, 8)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {row.first_name} {row.last_name}
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {row.phone}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.zip_code || t("admin.dashboard.na")}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.country || t("admin.dashboard.na")}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {(row.lead_unit_type ?? "single") === "family" ? t("adminLeads.family") : t("adminLeads.single")}
                        </TableCell>
                        <TableCell>
                          {row.categories?.name ?? t("admin.dashboard.na")}
                        </TableCell>
                        <TableCell>
                          <LeadSourceBadge lead={row} t={t} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {reviewStatusLabel(row.review_status)}
                        </TableCell>
                        <TableCell className="max-w-[240px] text-muted-foreground">
                          {row.summary ? (
                            <button
                              type="button"
                              onClick={() => setSummaryLead(row)}
                              title={t("adminLeads.viewSummary")}
                              className="block max-w-full truncate text-left text-primary underline-offset-2 hover:underline"
                            >
                              {row.summary}
                            </button>
                          ) : (
                            t("admin.dashboard.na")
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(row.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {row.sold_at ? (
                            <Badge className="bg-rose-500/15 text-rose-300 hover:bg-rose-500/25">
                              {t("adminLeads.sold")}
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25">
                              {t("adminLeads.available")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t("adminLeads.leadActions")}
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {!row.sold_at ? (
                                <DropdownMenuItem
                                  onClick={() => openSignupFreeDeliver(row)}
                                >
                                  <CreditCard className="size-4" />
                                  {t("adminLeads.deliverSignupFree")}
                                </DropdownMenuItem>
                              ) : null}
                              {!row.sold_at ? (
                                <DropdownMenuItem
                                  onClick={() => openPrepaidDeliver(row)}
                                >
                                  <CreditCard className="size-4" />
                                  {t("adminLeads.deliverPrepaid")}
                                </DropdownMenuItem>
                              ) : null}
                              {!row.sold_at ? (
                                <DropdownMenuItem
                                  onClick={() => openFreeDeliver(row)}
                                >
                                  <Gift className="size-4" />
                                  {t("adminLeads.deliverFree")}
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem onClick={() => openEdit(row)}>
                                <Pencil className="size-4" />
                                {t("adminLeads.edit")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => void handleDelete(row.id)}
                                disabled={deleting}
                              >
                                <Trash2 className="size-4" />
                                {t("adminLeads.delete")}
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
          <AdminTablePagination
            page={page}
            pageCount={Math.max(1, Math.ceil(totalLeads / ADMIN_PAGE_SIZE) || 1)}
            total={totalLeads}
            pageSize={ADMIN_PAGE_SIZE}
            onPageChange={setPage}
          />
        </Card>
      )}

      <Dialog
        open={signupFreeDialogOpen}
        onOpenChange={(open) => {
          setSignupFreeDialogOpen(open);
          if (!open) setSignupFreeLead(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form onSubmit={(e) => void handleSignupFreeDeliver(e)}>
            <DialogHeader>
              <DialogTitle>{t("adminLeads.deliverLeadSignupFree")}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4 text-sm">
              <p className="text-muted-foreground">
                {t("adminLeads.deliverLeadSignupFreeDesc")}
              </p>
              {signupFreeLead ? (
                <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                  {signupFreeLead.first_name} {signupFreeLead.last_name} ·{" "}
                  {signupFreeLead.categories?.name ?? t("admin.dashboard.na")} · {t("adminLeads.unit")}:{" "}
                  {signupFreeLead.lead_unit_type ?? "single"}
                </p>
              ) : null}
              <div className="space-y-2">
                <Label>{t("adminLeads.organization")}</Label>
                <Select
                  value={signupFreeOrgId}
                  onValueChange={setSignupFreeOrgId}
                  disabled={orgChoices.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        orgChoices.length === 0
                          ? t("adminLeads.noCustomersWithOrgs")
                          : t("adminLeads.selectOrganizationLabel")
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {orgChoices.map(([id, name]) => (
                      <SelectItem key={id} value={id}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSignupFreeDialogOpen(false)}
              >
                {t("adminLeads.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={deliveringSignupFree || orgChoices.length === 0}
              >
                {t("adminLeads.deliver")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={prepaidDialogOpen}
        onOpenChange={(open) => {
          setPrepaidDialogOpen(open);
          if (!open) setPrepaidLead(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form onSubmit={(e) => void handlePrepaidDeliver(e)}>
            <DialogHeader>
              <DialogTitle>{t("adminLeads.deliverLeadPrepaid")}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4 text-sm">
              <p className="text-muted-foreground">
                {t("adminLeads.deliverLeadPrepaidDesc")}
              </p>
              {prepaidLead ? (
                <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                  {prepaidLead.first_name} {prepaidLead.last_name} ·{" "}
                  {prepaidLead.categories?.name ?? t("admin.dashboard.na")} · {t("adminLeads.unit")}:{" "}
                  {prepaidLead.lead_unit_type ?? "single"}
                </p>
              ) : null}
              <div className="space-y-2">
                <Label>{t("adminLeads.organization")}</Label>
                <Select
                  value={prepaidOrgId}
                  onValueChange={setPrepaidOrgId}
                  disabled={orgChoices.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        orgChoices.length === 0
                          ? t("adminLeads.noCustomersWithOrgs")
                          : t("adminLeads.selectOrganizationLabel")
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {orgChoices.map(([id, name]) => (
                      <SelectItem key={id} value={id}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPrepaidDialogOpen(false)}
              >
                {t("adminLeads.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={deliveringPrepaid || orgChoices.length === 0}
              >
                {t("adminLeads.deliver")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={freeDialogOpen}
        onOpenChange={(open) => {
          setFreeDialogOpen(open);
          if (!open) setFreeLead(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form onSubmit={(e) => void handleFreeDeliver(e)}>
            <DialogHeader>
              <DialogTitle>{t("adminLeads.deliverLeadFree")}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4 text-sm">
              <p className="text-muted-foreground">
                {t("adminLeads.deliverLeadFreeDesc")}
              </p>
              {freeLead ? (
                <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                  {freeLead.first_name} {freeLead.last_name} ·{" "}
                  {freeLead.categories?.name ?? t("admin.dashboard.na")} · {t("adminLeads.unit")}:{" "}
                  {freeLead.lead_unit_type ?? "single"}
                </p>
              ) : null}
              <div className="space-y-2">
                <Label>{t("adminLeads.organization")}</Label>
                <Select
                  value={freeOrgId}
                  onValueChange={setFreeOrgId}
                  disabled={orgChoices.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        orgChoices.length === 0
                          ? t("adminLeads.noCustomersWithOrgs")
                          : t("adminLeads.selectOrganizationLabel")
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {orgChoices.map(([id, name]) => (
                      <SelectItem key={id} value={id}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFreeDialogOpen(false)}
              >
                {t("adminLeads.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={deliveringFree || orgChoices.length === 0}
              >
                {t("adminLeads.deliver")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={summaryLead !== null}
        onOpenChange={(open) => {
          if (!open) setSummaryLead(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("adminLeads.summaryDetail")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            {summaryLead ? (
              <p className="text-xs text-muted-foreground">
                {summaryLead.first_name} {summaryLead.last_name} ·{" "}
                {summaryLead.categories?.name ?? t("admin.dashboard.na")}
              </p>
            ) : null}
            {summaryLead?.review_status ? (
              <p className="text-sm">
                <span className="font-medium">{t("adminLeads.reviewStatus")}:</span>{" "}
                {reviewStatusLabel(summaryLead.review_status)}
              </p>
            ) : null}
            <p className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words leading-relaxed">
              {summaryLead?.summary || t("adminLeads.noSummary")}
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSummaryLead(null)}
            >
              {t("adminLeads.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={(e) => void handleSubmit(e)}>
            <DialogHeader>
              <DialogTitle>
                {editing ? t("adminLeads.editLead") : t("adminLeads.newLead")}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>{t("adminLeads.category")}</Label>
                <Select
                  value={form.category_id}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, category_id: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("adminLeads.selectCategory")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(categories ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("adminLeads.leadType")}</Label>
                <Select
                  value={form.lead_unit_type}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, lead_unit_type: v as "single" | "family" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("adminLeads.leadType")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">{t("adminLeads.single")}</SelectItem>
                    <SelectItem value="family">{t("adminLeads.family")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="first_name">{t("adminLeads.firstName")}</Label>
                  <Input
                    id="first_name"
                    value={form.first_name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, first_name: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">{t("adminLeads.lastName")}</Label>
                  <Input
                    id="last_name"
                    value={form.last_name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, last_name: e.target.value }))
                    }
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">{t("adminLeads.phone")}</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">{t("adminLeads.country")}</Label>
                <Input
                  id="country"
                  value={form.country}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, country: e.target.value }))
                  }
                  placeholder={t("adminLeads.countryExample")}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="summary">{t("adminLeads.summary")}</Label>
                <Textarea
                  id="summary"
                  value={form.summary}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, summary: e.target.value }))
                  }
                  rows={3}
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="sold"
                  checked={form.sold}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, sold: Boolean(v) }))
                  }
                />
                <Label htmlFor="sold" className="font-normal">
                  {t("adminLeads.markAsSold")}
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                {t("adminLeads.cancel")}
              </Button>
              <Button type="submit" disabled={creating || updating}>
                {editing ? t("adminLeads.save") : t("adminLeads.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={csvImportOpen}
        onOpenChange={(open) => {
          setCsvImportOpen(open);
          if (!open) setCsvPreview(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("adminLeads.csvImportPreview")}</DialogTitle>
          </DialogHeader>
          {csvPreview ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-md border p-3">
                  <p className="text-muted-foreground">{t("adminLeads.csvValidRows")}</p>
                  <p className="text-lg font-semibold">{csvPreview.validRows.length}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-muted-foreground">{t("adminLeads.csvInvalidRows")}</p>
                  <p className="text-lg font-semibold">{csvPreview.invalidRows.length}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-muted-foreground">{t("adminLeads.csvMappedColumns")}</p>
                  <p className="text-lg font-semibold">
                    {Object.keys(csvPreview.mappedHeaders).length}
                  </p>
                </div>
              </div>

              {Object.keys(csvPreview.mappedHeaders).length > 0 ? (
                <div className="rounded-md border p-3">
                  <p className="mb-2 font-medium">{t("adminLeads.csvColumnMapping")}</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(csvPreview.mappedHeaders).map(([header, field]) => (
                      <Badge key={header} variant="outline">
                        {header} → {field}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {csvPreview.invalidRows.length > 0 ? (
                <div className="max-h-48 overflow-y-auto rounded-md border p-3">
                  <p className="mb-2 font-medium text-destructive">
                    {t("adminLeads.csvRowErrors")}
                  </p>
                  <ul className="space-y-2">
                    {csvPreview.invalidRows.slice(0, 20).map((row) => (
                      <li key={row.rowNumber}>
                        <span className="font-medium">
                          {t("adminLeads.csvRow")} {row.rowNumber}:
                        </span>{" "}
                        {row.errors.join("; ")}
                      </li>
                    ))}
                  </ul>
                  {csvPreview.invalidRows.length > 20 ? (
                    <p className="mt-2 text-muted-foreground">
                      +{csvPreview.invalidRows.length - 20} {t("adminLeads.csvMoreErrors")}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {csvPreview.validRows.length > 0 ? (
                <div className="max-h-48 overflow-y-auto rounded-md border p-3">
                  <p className="mb-2 font-medium">{t("adminLeads.csvSampleRows")}</p>
                  <ul className="space-y-2">
                    {csvPreview.validRows.slice(0, 5).map((row) => (
                      <li key={row.rowNumber}>
                        {t("adminLeads.csvRow")} {row.rowNumber}:{" "}
                        {[row.first_name, row.last_name].filter(Boolean).join(" ") || "—"} ·{" "}
                        {row.phone}
                        {row.review_status ? ` · ${reviewStatusLabel(row.review_status)}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCsvImportOpen(false);
                setCsvPreview(null);
              }}
            >
              {t("adminLeads.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => void confirmCsvImport()}
              disabled={importingCsv || !csvPreview || csvPreview.validRows.length === 0}
            >
              {importingCsv ? t("adminLeads.csvImporting") : t("adminLeads.csvConfirmImport")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
