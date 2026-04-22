"use client";

import { useState } from "react";
import {
  MoreHorizontal,
  Flame,
  PhoneOff,
  PhoneCall,
  CheckCircle2,
  XCircle,
  Ban,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import {
  useGetClientMeQuery,
  useGetCustomerLeadsQuery,
  useUpdateCustomerLeadMutation,
  type CustomerLead,
  type CustomerLeadSort,
} from "@/lib/api/client-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

export function ClientAssignedLeads() {
  const { data: me } = useGetClientMeQuery();
  const [search, setSearch] = useState("");
  const [unitType, setUnitType] = useState<"all" | "single" | "family">("all");
  const [status, setStatus] = useState<string>("all");
  const [sort, setSort] = useState<CustomerLeadSort>("newest_added");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeLead, setActiveLead] = useState<CustomerLead | null>(null);
  const [modalStatus, setModalStatus] = useState<string>("new");
  const [modalNotes, setModalNotes] = useState("");

  const { data, isLoading } = useGetCustomerLeadsQuery(
    {
      assignedTo: me?.id ?? "all",
      status: status as "all" | (typeof statusOptions)[number],
      unitType,
      sort,
      search,
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

  async function patchLead(id: string, patch: { status?: string; notes?: string }) {
    try {
      await updateLead({
        id,
        ...(patch.status ? { status: patch.status as never } : {}),
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
    setModalNotes(row.notes ?? "");
    setDialogOpen(true);
  }

  async function saveModal() {
    if (!activeLead) return;
    await patchLead(activeLead.id, {
      status: modalStatus,
      notes: modalNotes,
    });
    setDialogOpen(false);
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Assigned</h1>
        <p className="text-sm text-muted-foreground">
          Leads assigned to you. Update status and add outreach notes.
        </p>
      </header>

      <Card className="border-border/70 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, phone, summary, notes"
          />
          <Select
            value={unitType}
            onValueChange={(v) => {
              setUnitType(v as "all" | "single" | "family");
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
                <TableHead>Category</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="h-20 text-center">Loading...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="h-20 text-center">No assigned leads yet.</TableCell></TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.first_name} {row.last_name}</TableCell>
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
      </Card>

      <div className="flex items-center justify-between text-sm">
        <p className="text-muted-foreground">Showing {rows.length} of {total}</p>
        <div className="flex items-center gap-2">
          <button
            className="rounded border border-border px-3 py-1.5 text-muted-foreground disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <span className="text-muted-foreground">Page {page}</span>
          <button
            className="rounded border border-border px-3 py-1.5 text-muted-foreground disabled:opacity-40"
            disabled={page * 20 >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>

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

