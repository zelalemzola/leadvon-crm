"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Eye,
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/components/providers/i18n-provider";
import {
  formatLeadDisplayId,
  formatLeadLocation,
  formatLeadRelativeTime,
  formatPhoneForDisplay,
  whatsappUrl,
} from "@/lib/client/lead-display";

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
  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false);
  const [activeSummary, setActiveSummary] = useState("");

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
    patch: {
      status?: string;
      assigned_to?: string | null;
      notes?: string;
      call_count?: number;
    }
  ) {
    try {
      await updateLead({
        id,
        ...(patch.status ? { status: patch.status as never } : {}),
        ...(patch.assigned_to !== undefined ? { assigned_to: patch.assigned_to } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        ...(patch.call_count !== undefined ? { call_count: patch.call_count } : {}),
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

  function openSummaryView(summary?: string | null) {
    setActiveSummary(summary?.trim() || t("clientDashboard.na"));
    setSummaryDialogOpen(true);
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
          {total > 0
            ? `${total} ${t("clientLeads.leadsFound")}`
            : t("clientLeads.subtitle")}
        </p>
      </header>

      <Card id="tour-client-leads-filters" className="border-border/70 bg-card/50">
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

      <Card id="tour-client-leads-table" className="border-border/70 bg-card/50">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("clientLeads.id")}</TableHead>
                <TableHead>{t("clientLeads.name")}</TableHead>
                <TableHead>{t("clientLeads.phone")}</TableHead>
                <TableHead>{t("clientLeads.zipCode")}</TableHead>
                <TableHead>{t("clientLeads.country")}</TableHead>
                <TableHead>{t("clientLeads.category")}</TableHead>
                <TableHead>{t("clientLeads.unit")}</TableHead>
                <TableHead>{t("clientLeads.summary")}</TableHead>
                <TableHead>{t("clientLeads.time")}</TableHead>
                <TableHead>{t("clientLeads.status")}</TableHead>
                <TableHead>{t("clientLeads.assignee")}</TableHead>
                <TableHead>{t("clientLeads.calls")}</TableHead>
                <TableHead>{t("clientLeads.notes")}</TableHead>
                <TableHead className="text-right">{t("clientLeads.view")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={14} className="h-20 text-center">{t("clientLeads.loading")}</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={14} className="h-20 text-center">{t("clientLeads.empty")}</TableCell></TableRow>
              ) : (
                rows.map((row) => {
                  const waLink = whatsappUrl(row.phone);
                  const callCount = row.call_count ?? 0;
                  return (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {formatLeadDisplayId(row)}
                    </TableCell>
                    <TableCell className="font-medium">{row.first_name} {row.last_name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="whitespace-nowrap text-sm">{formatPhoneForDisplay(row.phone)}</span>
                        {waLink ? (
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex shrink-0 rounded-md p-1 transition-colors hover:bg-emerald-500/10"
                            aria-label={t("clientLeads.openWhatsApp")}
                          >
                            <WhatsAppIcon className="size-4 text-emerald-400" />
                          </a>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatLeadLocation(row)}</TableCell>
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
                    <TableCell className="max-w-[200px]">
                      <Button
                        variant="link"
                        className="h-auto max-w-full justify-start px-0 py-0 text-left font-normal text-muted-foreground"
                        onClick={() => openSummaryView(row.summary)}
                      >
                        <span className="line-clamp-2">
                          {row.summary?.trim() || t("clientDashboard.na")}
                        </span>
                      </Button>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatLeadRelativeTime(row.created_at)}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={row.status}
                        onValueChange={(value) => void patchLead(row.id, { status: value })}
                      >
                        <SelectTrigger className="h-8 w-[9.5rem] border-border/70 bg-background/60">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map((s) => (
                            <SelectItem key={s} value={s}>
                              <span className="flex items-center gap-1.5">
                                {(() => {
                                  const meta = statusMeta[s];
                                  const Icon = meta.icon;
                                  return <Icon className={`size-3.5 ${meta.color}`} />;
                                })()}
                                {t(`clientDashboard.status.${s}`)}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={row.assigned_to ?? "unassigned"}
                        onValueChange={(value) =>
                          void patchLead(row.id, {
                            assigned_to: value === "unassigned" ? null : value,
                          })
                        }
                      >
                        <SelectTrigger className="h-8 w-[10rem] border-border/70 bg-background/60">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">
                            <span className="flex items-center gap-1.5">
                              <UserX2 className="size-3.5 text-muted-foreground" />
                              {t("clientLeads.unassigned")}
                            </span>
                          </SelectItem>
                          {userOptions.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              <span className="flex items-center gap-1.5">
                                <UserRound className="size-3.5 text-sky-400" />
                                {u.full_name || u.email || u.id.slice(0, 8)}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <LeadCallsCell
                        value={callCount}
                        onSave={(call_count) => void patchLead(row.id, { call_count })}
                      />
                    </TableCell>
                    <TableCell className="max-w-[180px]">
                      <LeadNotesCell
                        notes={row.notes}
                        placeholder={t("clientLeads.addNotes")}
                        onSave={(notes) => void patchLead(row.id, { notes })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon-sm" onClick={() => openLeadView(row)}>
                        <Eye className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
        <div
          id="tour-client-leads-pagination"
          className="flex items-center justify-between border-t border-border/70 px-4 py-3 text-sm"
        >
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
      <Dialog open={summaryDialogOpen} onOpenChange={setSummaryDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("clientLeads.summaryDetails")}</DialogTitle>
          </DialogHeader>
          <p className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words text-sm text-foreground/90">
            {activeSummary}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSummaryDialogOpen(false)}>
              {t("clientLeads.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function LeadCallsCell({
  value,
  onSave,
}: {
  value: number;
  onSave: (callCount: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <Input
      type="number"
      min={0}
      max={9999}
      inputMode="numeric"
      className="h-8 w-16 px-2 text-center text-sm font-semibold tabular-nums"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = Math.max(0, Math.min(9999, Number(draft) || 0));
        setDraft(String(next));
        if (next !== value) onSave(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

function LeadNotesCell({
  notes,
  placeholder,
  onSave,
}: {
  notes?: string | null;
  placeholder: string;
  onSave: (notes: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(notes ?? "");

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(notes ?? "");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="line-clamp-2 w-full text-left text-sm text-muted-foreground hover:text-foreground"
        >
          {notes?.trim() || placeholder}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <Textarea
          rows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
        />
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            {t("clientLeads.cancel")}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onSave(draft);
              setOpen(false);
            }}
          >
            {t("clientLeads.saveChanges")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

