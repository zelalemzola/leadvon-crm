"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  useGetClientMeQuery,
  useGetCustomerLeadsQuery,
  useUpdateCustomerLeadMutation,
} from "@/lib/api/client-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

export function ClientAssignedLeads() {
  const { data: me } = useGetClientMeQuery();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useGetCustomerLeadsQuery({
    assignedTo: me?.id ?? "all",
    status: status as "all" | (typeof statusOptions)[number],
    search,
    page,
    pageSize: 20,
  });
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
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, phone, summary, notes"
          />
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
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/50">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="h-20 text-center">Loading...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="h-20 text-center">No assigned leads yet.</TableCell></TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.first_name} {row.last_name}</TableCell>
                    <TableCell className="text-muted-foreground">{row.phone}</TableCell>
                    <TableCell>{row.categories?.name ?? "—"}</TableCell>
                    <TableCell className="max-w-[260px] truncate text-muted-foreground">
                      {row.summary || "—"}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={row.status}
                        onValueChange={(v) => void patchLead(row.id, { status: v })}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map((s) => (
                            <SelectItem key={s} value={s}>{formatStatus(s)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        className="min-w-[260px]"
                        defaultValue={row.notes ?? ""}
                        placeholder="Leave follow-up notes"
                        onBlur={(e) => {
                          if ((row.notes ?? "") !== e.target.value) {
                            void patchLead(row.id, { notes: e.target.value });
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {new Date(row.status_updated_at).toLocaleDateString()}
                      </Badge>
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
    </div>
  );
}

function formatStatus(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

