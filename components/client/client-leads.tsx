"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  useGetCategoriesQuery,
} from "@/lib/api/admin-api";
import {
  useGetCustomerLeadsQuery,
  useGetCustomerLeadCountriesQuery,
  useUpdateCustomerLeadMutation,
  useGetOrgUsersQuery,
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

export function ClientLeads() {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [country, setCountry] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [assignee, setAssignee] = useState<string>("all");
  const [page, setPage] = useState(1);

  const { data: categories } = useGetCategoriesQuery();
  const { data: countries } = useGetCustomerLeadCountriesQuery();
  const { data: users } = useGetOrgUsersQuery();
  const { data, isLoading, isError, error } = useGetCustomerLeadsQuery({
    search,
    categoryId: categoryId === "all" ? undefined : categoryId,
    country,
    status: status as "all" | (typeof statusOptions)[number],
    assignedTo: assignee,
    page,
    pageSize: 20,
  });
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
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
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
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/50">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="h-20 text-center">Loading...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="h-20 text-center">No leads found.</TableCell></TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.first_name} {row.last_name}</TableCell>
                    <TableCell className="text-muted-foreground">{row.phone}</TableCell>
                    <TableCell className="text-muted-foreground">{row.country || "—"}</TableCell>
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
                      <Select
                        value={row.assigned_to ?? "unassigned"}
                        onValueChange={(v) =>
                          void patchLead(row.id, {
                            assigned_to: v === "unassigned" ? null : v,
                          })
                        }
                      >
                        <SelectTrigger className="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {userOptions.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.full_name || u.email || u.id.slice(0, 8)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-[260px] items-center gap-2">
                        <Input
                          defaultValue={row.notes ?? ""}
                          placeholder="Leave follow-up notes"
                          onBlur={(e) => {
                            if ((row.notes ?? "") !== e.target.value) {
                              void patchLead(row.id, { notes: e.target.value });
                            }
                          }}
                        />
                      </div>
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
    </div>
  );
}

function formatStatus(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
