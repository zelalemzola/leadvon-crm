"use client";

import { useMemo, useState } from "react";
import {
  MoreHorizontal,
  Flame,
  PhoneOff,
  PhoneCall,
  CheckCircle2,
  XCircle,
  Ban,
  Copy,
  UserRound,
  UserX2,
} from "lucide-react";
import { toast } from "sonner";
import { useGetCategoriesQuery } from "@/lib/api/admin-api";
import {
  useGetCustomerLeadsQuery,
  useGetCustomerLeadCountriesQuery,
  useUpdateCustomerLeadMutation,
  useGetOrgUsersQuery,
  type CustomerLead,
  type CustomerLeadSort,
} from "@/lib/api/client-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/providers/i18n-provider";

const statusOptions = [
  "new",
  "no_answer",
  "call_back",
  "qualified",
  "not_interested",
  "unqualified",
  "duplicate",
  "closed",
] as const;

const statusMeta = {
  new: { key: "new", icon: Flame, color: "text-amber-400" },
  no_answer: { key: "no_answer", icon: PhoneOff, color: "text-orange-400" },
  call_back: { key: "call_back", icon: PhoneCall, color: "text-yellow-400" },
  qualified: { key: "qualified", icon: CheckCircle2, color: "text-emerald-400" },
  not_interested: { key: "not_interested", icon: XCircle, color: "text-rose-400" },
  unqualified: { key: "unqualified", icon: Ban, color: "text-red-400" },
  duplicate: { key: "duplicate", icon: Copy, color: "text-violet-400" },
  closed: { key: "closed", icon: CheckCircle2, color: "text-sky-400" },
} as const;

type LeadUnitFilter = "all" | "single" | "family";

export function ClientLeads() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [country, setCountry] = useState<string>("all");
  const [unitType, setUnitType] = useState<LeadUnitFilter>("all");
  const [status, setStatus] = useState<string>("all");
  const [assignee, setAssignee] = useState<string>("all");
  const [sort, setSort] = useState<CustomerLeadSort>("newest_added");
  const [page, setPage] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeLead, setActiveLead] = useState<CustomerLead | null>(null);
  const [modalStatus, setModalStatus] = useState<string>("new");
  const [modalAssignee, setModalAssignee] = useState<string>("unassigned");
  const [modalNotes, setModalNotes] = useState("");

  const { data: categories } = useGetCategoriesQuery();
  const { data: countries } = useGetCustomerLeadCountriesQuery();
  const { data: users } = useGetOrgUsersQuery();
  const { data, isLoading, isError, error } = useGetCustomerLeadsQuery(
    {
      search,
      categoryId: categoryId === "all" ? undefined : categoryId,
      country,
      unitType,
      status: status as "all" | (typeof statusOptions)[number],
      assignedTo: assignee,
      sort,
      page,
      pageSize: 20,
    },
    {
      pollingInterval: 10 * 60 * 1000,
    }
  );
  const [updateLead] = useUpdateCustomerLeadMutation();

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  const userOptions = useMemo(
    () => (users ?? []).filter((u) => u.role.startsWith("customer_") && u.is_active),
    [users]
  );

  async function patchLead(
    id: string,
    patch: { status?: string; assigned_to?: string | null; notes?: string }
  ) {
    try {
      await updateLead({
        id,
        ...(patch.status ? { status: patch.status as never } : {}),
        ...(patch.assigned_to !== undefined ? { assigned_to: patch.assigned_to } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      }).unwrap();
      toast.success(t("clientLeads.toastUpdated"));
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : t("clientLeads.toastUpdateFailed");
      toast.error(msg);
    }
  }

  function openLeadView(row: CustomerLead) {
    setActiveLead(row);
    setModalStatus(row.status);
    setModalAssignee(row.assigned_to ?? "unassigned");
    setModalNotes(row.notes ?? "");
    setDialogOpen(true);
  }

  async function saveModal() {
    if (!activeLead) return;
    await patchLead(activeLead.id, {
      status: modalStatus,
      assigned_to: modalAssignee === "unassigned" ? null : modalAssignee,
      notes: modalNotes,
    });
    setDialogOpen(false);
  }

  if (isError) {
    return (
      <div className="p-8 text-destructive">
        {t("clientLeads.failed")}{" "}
        {error && typeof error === "object" && "data" in error
          ? String((error as { data?: unknown }).data)
          : t("clientLeads.unknownError")}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("clientLeads.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("clientLeads.subtitle")}
        </p>
      </header>

      <Card className="border-border/70 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("clientLeads.filters")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-7">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t("clientLeads.searchPlaceholder")}
          />
          <Select
            value={categoryId}
            onValueChange={(v) => {
              setCategoryId(v);
              setPage(1);
            }}
          >
            <SelectTrigger><SelectValue placeholder={t("clientLeads.category")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("clientLeads.allCategories")}</SelectItem>
              {(categories ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={country}
            onValueChange={(v) => {
              setCountry(v);
              setPage(1);
            }}
          >
            <SelectTrigger><SelectValue placeholder={t("clientLeads.country")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("clientLeads.allCountries")}</SelectItem>
              {(countries ?? []).map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={unitType}
            onValueChange={(v) => {
              setUnitType(v as LeadUnitFilter);
              setPage(1);
            }}
          >
            <SelectTrigger><SelectValue placeholder={t("clientLeads.unitType")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("clientLeads.allUnits")}</SelectItem>
              <SelectItem value="single">{t("clientLeads.single")}</SelectItem>
              <SelectItem value="family">{t("clientLeads.family")}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger><SelectValue placeholder={t("clientLeads.status")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("clientLeads.allStatus")}</SelectItem>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>{t(`clientDashboard.status.${s}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={assignee}
            onValueChange={(v) => {
              setAssignee(v);
              setPage(1);
            }}
          >
            <SelectTrigger><SelectValue placeholder={t("clientLeads.assignee")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("clientLeads.allAssignees")}</SelectItem>
              {userOptions.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.full_name || u.email || u.id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={sort}
            onValueChange={(v) => {
              setSort(v as CustomerLeadSort);
              setPage(1);
            }}
          >
            <SelectTrigger><SelectValue placeholder={t("clientLeads.sort")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest_added">{t("clientLeads.sortNewestAdded")}</SelectItem>
              <SelectItem value="oldest_added">{t("clientLeads.sortOldestAdded")}</SelectItem>
              <SelectItem value="recently_updated">{t("clientLeads.sortRecentlyUpdated")}</SelectItem>
              <SelectItem value="oldest_updated">{t("clientLeads.sortOldestUpdated")}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/50">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("clientLeads.name")}</TableHead>
                <TableHead>{t("clientLeads.country")}</TableHead>
                <TableHead>{t("clientLeads.category")}</TableHead>
                <TableHead>{t("clientLeads.unit")}</TableHead>
                <TableHead>{t("clientLeads.status")}</TableHead>
                <TableHead>{t("clientLeads.assignee")}</TableHead>
                <TableHead>{t("clientLeads.updated")}</TableHead>
                <TableHead className="text-right">{t("clientLeads.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="h-20 text-center">{t("clientLeads.loading")}</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="h-20 text-center">{t("clientLeads.empty")}</TableCell></TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.first_name} {row.last_name}</TableCell>
                    <TableCell className="text-muted-foreground">{row.country || t("clientDashboard.na")}</TableCell>
                    <TableCell>{row.categories?.name ?? t("clientDashboard.na")}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          (row.lead_unit_type ?? "single") === "family"
                            ? "bg-violet-500/15 text-violet-300 hover:bg-violet-500/25"
                            : "bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25"
                        }
                      >
                        {(row.lead_unit_type ?? "single") === "family" ? t("clientLeads.family") : t("clientLeads.single")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1.5">
                        {(() => {
                          const meta = statusMeta[row.status];
                          const Icon = meta.icon;
                          return (
                            <>
                              <Icon className={`size-3.5 ${meta.color}`} />
                              {t(`clientDashboard.status.${meta.key}`)}
                            </>
                          );
                        })()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.assignee ? (
                        <Badge variant="outline" className="gap-1.5">
                          <UserRound className="size-3.5 text-sky-400" />
                          {row.assignee.full_name || row.assignee.email || t("clientLeads.assigned")}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1.5">
                          <UserX2 className="size-3.5 text-muted-foreground" />
                          {t("clientLeads.unassigned")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {new Date(row.status_updated_at).toLocaleDateString()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openLeadView(row)}>
                            {t("clientLeads.view")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
        <div className="flex items-center justify-between border-t border-border/70 px-4 py-3 text-sm">
          <p className="text-muted-foreground">{t("clientLeads.showing")} {rows.length} {t("clientLeads.of")} {total}</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              {t("clientLeads.prev")}
            </Button>
            <span className="text-muted-foreground">{t("clientLeads.page")} {page}</span>
            <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage((p) => p + 1)}>
              {t("clientLeads.next")}
            </Button>
          </div>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("clientLeads.leadDetails")}</DialogTitle>
          </DialogHeader>
          {activeLead ? (
            <div className="grid gap-4 py-2">
              <div className="grid gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">{t("clientLeads.name")}</p>
                  <p className="font-medium">{activeLead.first_name} {activeLead.last_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("clientLeads.phone")}</p>
                  <p className="font-medium">{activeLead.phone}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("clientLeads.category")}</p>
                  <p className="font-medium">{activeLead.categories?.name ?? t("clientDashboard.na")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("clientLeads.unit")}</p>
                  <Badge
                    className={
                      (activeLead.lead_unit_type ?? "single") === "family"
                        ? "bg-violet-500/15 text-violet-300 hover:bg-violet-500/25"
                        : "bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25"
                    }
                  >
                    {(activeLead.lead_unit_type ?? "single") === "family" ? t("clientLeads.family") : t("clientLeads.single")}
                  </Badge>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">{t("clientLeads.summary")}</p>
                  <p className="whitespace-pre-wrap text-sm text-foreground/90">{activeLead.summary || t("clientDashboard.na")}</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("clientLeads.status")}</Label>
                  <Select value={modalStatus} onValueChange={setModalStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((s) => (
                        <SelectItem key={s} value={s}>{t(`clientDashboard.status.${s}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("clientLeads.assignee")}</Label>
                  <Select value={modalAssignee} onValueChange={setModalAssignee}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">{t("clientLeads.unassigned")}</SelectItem>
                      {userOptions.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.full_name || u.email || u.id.slice(0, 8)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("clientLeads.notes")}</Label>
                <Textarea
                  rows={5}
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  placeholder={t("clientLeads.notesPlaceholder")}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("clientLeads.cancel")}
            </Button>
            <Button onClick={() => void saveModal()}>
              {t("clientLeads.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

