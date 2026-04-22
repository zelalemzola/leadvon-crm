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
  new: { label: "New", icon: Flame, color: "text-amber-400" },
  no_answer: { label: "No Answer", icon: PhoneOff, color: "text-orange-400" },
  call_back: { label: "Call Back", icon: PhoneCall, color: "text-yellow-400" },
  qualified: { label: "Qualified", icon: CheckCircle2, color: "text-emerald-400" },
  not_interested: { label: "Not Interested", icon: XCircle, color: "text-rose-400" },
  unqualified: { label: "Unqualified", icon: Ban, color: "text-red-400" },
  duplicate: { label: "Duplicate", icon: Copy, color: "text-violet-400" },
  closed: { label: "Closed", icon: CheckCircle2, color: "text-sky-400" },
} as const;

type LeadUnitFilter = "all" | "single" | "family";

export function ClientLeads() {
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
      toast.success("Lead updated");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : "Update failed";
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
        Failed to load leads:{" "}
        {error && typeof error === "object" && "data" in error
          ? String((error as { data?: unknown }).data)
          : "Unknown error"}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
        <p className="text-sm text-muted-foreground">
          Manage purchased leads and assign them to your team.
        </p>
      </header>

      <Card className="border-border/70 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-7">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, phone, summary, notes"
          />
          <Select
            value={categoryId}
            onValueChange={(v) => {
              setCategoryId(v);
              setPage(1);
            }}
          >
            <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
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
            <SelectTrigger><SelectValue placeholder="Country" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All countries</SelectItem>
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
            <SelectTrigger><SelectValue placeholder="Unit type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All units</SelectItem>
              <SelectItem value="single">Single</SelectItem>
              <SelectItem value="family">Family</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>{formatStatus(s)}</SelectItem>
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
            <SelectTrigger><SelectValue placeholder="Assignee" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignees</SelectItem>
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
            <SelectTrigger><SelectValue placeholder="Sort" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest_added">Recently added</SelectItem>
              <SelectItem value="oldest_added">Oldest added</SelectItem>
              <SelectItem value="recently_updated">Recently updated</SelectItem>
              <SelectItem value="oldest_updated">Oldest updated</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/50">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="h-20 text-center">Loading...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="h-20 text-center">No leads found.</TableCell></TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.first_name} {row.last_name}</TableCell>
                    <TableCell className="text-muted-foreground">{row.country || "—"}</TableCell>
                    <TableCell>{row.categories?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          (row.lead_unit_type ?? "single") === "family"
                            ? "bg-violet-500/15 text-violet-300 hover:bg-violet-500/25"
                            : "bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25"
                        }
                      >
                        {(row.lead_unit_type ?? "single") === "family" ? "Family" : "Single"}
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
                              {meta.label}
                            </>
                          );
                        })()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.assignee ? (
                        <Badge variant="outline" className="gap-1.5">
                          <UserRound className="size-3.5 text-sky-400" />
                          {row.assignee.full_name || row.assignee.email || "Assigned"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1.5">
                          <UserX2 className="size-3.5 text-muted-foreground" />
                          Unassigned
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
                            View
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
          <p className="text-muted-foreground">Showing {rows.length} of {total}</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Prev
            </Button>
            <span className="text-muted-foreground">Page {page}</span>
            <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Lead details</DialogTitle>
          </DialogHeader>
          {activeLead ? (
            <div className="grid gap-4 py-2">
              <div className="grid gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Name</p>
                  <p className="font-medium">{activeLead.first_name} {activeLead.last_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="font-medium">{activeLead.phone}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Category</p>
                  <p className="font-medium">{activeLead.categories?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Unit</p>
                  <Badge
                    className={
                      (activeLead.lead_unit_type ?? "single") === "family"
                        ? "bg-violet-500/15 text-violet-300 hover:bg-violet-500/25"
                        : "bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25"
                    }
                  >
                    {(activeLead.lead_unit_type ?? "single") === "family" ? "Family" : "Single"}
                  </Badge>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Summary</p>
                  <p className="whitespace-pre-wrap text-sm text-foreground/90">{activeLead.summary || "—"}</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={modalStatus} onValueChange={setModalStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((s) => (
                        <SelectItem key={s} value={s}>{formatStatus(s)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Assignee</Label>
                  <Select value={modalAssignee} onValueChange={setModalAssignee}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
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
                <Label>Notes</Label>
                <Textarea
                  rows={5}
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  placeholder="Add outreach notes, call outcomes, objections, and next steps..."
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveModal()}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatStatus(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
