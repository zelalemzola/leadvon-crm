"use client";

import { useMemo, useRef, useState } from "react";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Upload,
  Download,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import {
  useGetCategoriesQuery,
  useGetLeadsQuery,
  useGetCustomersQuery,
  useCreateLeadMutation,
  useUpdateLeadMutation,
  useDeleteLeadMutation,
  useDeliverPrepaidLeadMutation,
  type AdminLeadsAvailability,
  type AdminLeadsSort,
} from "@/lib/api/admin-api";
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

export function AdminLeads() {
  const { localizePath, t } = useI18n();
  const [categoryFilter, setCategoryFilter] = useState<string | "all">("all");
  const [search, setSearch] = useState("");
  const [availabilityFilter, setAvailabilityFilter] =
    useState<AdminLeadsAvailability>("all");
  const [countryFilter, setCountryFilter] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [sort, setSort] = useState<AdminLeadsSort>("newest");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [prepaidDialogOpen, setPrepaidDialogOpen] = useState(false);
  const [prepaidLead, setPrepaidLead] = useState<LeadWithCategory | null>(null);
  const [prepaidOrgId, setPrepaidOrgId] = useState("");
  const [editing, setEditing] = useState<LeadWithCategory | null>(null);
  const [form, setForm] = useState(emptyForm);
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
    pageSize: 20,
    availability: availabilityFilter,
    country: countryFilter,
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
    sort,
  });

  const [createLead, { isLoading: creating }] = useCreateLeadMutation();
  const [updateLead, { isLoading: updating }] = useUpdateLeadMutation();
  const [deleteLead, { isLoading: deleting }] = useDeleteLeadMutation();
  const [deliverPrepaid, { isLoading: deliveringPrepaid }] =
    useDeliverPrepaidLeadMutation();

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

  function exportCsv() {
    const headers = [
      "id",
      "first_name",
      "last_name",
      "phone",
      "country",
      "lead_unit_type",
      "category",
      "summary",
      "status",
      "created_at",
    ];
    const lines = rows.map((r) =>
      [
        r.id,
        r.first_name,
        r.last_name,
        r.phone,
        r.country ?? "",
        r.lead_unit_type ?? "single",
        r.categories?.name ?? "",
        (r.summary ?? "").replaceAll('"', '""'),
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

  async function importCsv(file: File) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      toast.error(t("adminLeads.csvEmpty"));
      return;
    }
    const header = lines[0].split(",").map((h) => h.trim().replaceAll('"', "").toLowerCase());
    const required = ["first_name", "last_name", "phone", "category"];
    const unitIdx = header.indexOf("lead_unit_type");
    const countryIdx = header.indexOf("country");
    for (const req of required) {
      if (!header.includes(req)) {
        toast.error(`${t("adminLeads.missingRequiredColumn")} ${req}`);
        return;
      }
    }
    const categoryMap = new Map((categories ?? []).map((c) => [c.name.toLowerCase(), c.id]));
    let imported = 0;
    for (const line of lines.slice(1)) {
      const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      if (values.length < header.length) continue;
      const row = Object.fromEntries(header.map((h, i) => [h, values[i] ?? ""])) as Record<
        string,
        string
      >;
      const categoryId = categoryMap.get(String(row.category).toLowerCase());
      if (!categoryId) continue;
      const countryVal =
        countryIdx >= 0 ? String(values[countryIdx] ?? "").trim() : "";
      await createLead({
        category_id: categoryId,
        lead_unit_type:
          unitIdx >= 0 && String(values[unitIdx] ?? "").trim().toLowerCase() === "family"
            ? "family"
            : "single",
        phone: String(row.phone ?? ""),
        first_name: String(row.first_name ?? ""),
        last_name: String(row.last_name ?? ""),
        country: countryVal || "Unknown",
        summary: String(row.summary ?? row.notes ?? ""),
      }).unwrap();
      imported++;
    }
    toast.success(`${t("adminLeads.imported")} ${imported} ${t("adminLeads.leads")}`);
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
            <Button variant="outline" onClick={() => importRef.current?.click()}>
              <Upload className="size-4" />
              {t("adminLeads.importCsv")}
            </Button>
            <input
              ref={importRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importCsv(f);
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
        <Card className="border-border/80 bg-card/50">
          <CardHeader className="border-b border-border/70 py-4">
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <Badge variant="outline" className="border-primary/40 text-primary">
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
                    <TableHead>{t("adminLeads.country")}</TableHead>
                    <TableHead>{t("adminLeads.unit")}</TableHead>
                    <TableHead>{t("adminLeads.category")}</TableHead>
                    <TableHead>{t("adminLeads.summary")}</TableHead>
                    <TableHead>{t("adminLeads.created")}</TableHead>
                    <TableHead>{t("adminLeads.status")}</TableHead>
                    <TableHead className="text-right">{t("adminLeads.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="h-24 text-center">
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
                          {row.country || t("admin.dashboard.na")}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {(row.lead_unit_type ?? "single") === "family" ? t("adminLeads.family") : t("adminLeads.single")}
                        </TableCell>
                        <TableCell>
                          {row.categories?.name ?? t("admin.dashboard.na")}
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate text-muted-foreground">
                          {row.summary || t("admin.dashboard.na")}
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
                                  onClick={() => openPrepaidDeliver(row)}
                                >
                                  <CreditCard className="size-4" />
                                  {t("adminLeads.deliverPrepaid")}
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
          <div className="flex items-center justify-between border-t border-border/70 px-4 py-3 text-sm">
            <p className="text-muted-foreground">
              {t("adminLeads.showing")} {rows.length} {t("adminLeads.of")} {totalLeads} {t("adminLeads.leads")}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t("adminLeads.prev")}
              </Button>
              <span className="text-muted-foreground">{t("adminLeads.page")} {page}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={page * 20 >= totalLeads}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("adminLeads.next")}
              </Button>
            </div>
          </div>
        </Card>
      )}

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
                <p className="rounded-md border border-border/80 bg-muted/40 px-3 py-2 text-xs">
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
                disabled={
                  deliveringPrepaid ||
                  !prepaidOrgId ||
                  orgChoices.length === 0
                }
              >
                {t("adminLeads.deliver")}
              </Button>
            </DialogFooter>
          </form>
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
    </div>
  );
}
