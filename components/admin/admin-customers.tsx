"use client";

import { useMemo, useState } from "react";
import {
  useGetCustomersQuery,
  useUpdateCustomerMutation,
} from "@/lib/api/admin-api";
import type { CustomerDirectoryRow, UserRole } from "@/types/database";
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
import { Building2, Contact, Download, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { cn, formatQueryError } from "@/lib/utils";

function customerRoleLabel(role: UserRole): string {
  if (role === "customer_admin") return "Org admin";
  if (role === "customer_agent") return "Agent";
  return role;
}

type RoleFilter = "all" | "customer_admin" | "customer_agent";
type StatusFilter = "all" | "active" | "inactive";
type SortKey = "joined" | "name" | "email" | "org" | "leads";
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
      case "name":
        va = (a.full_name ?? "").toLowerCase();
        vb = (b.full_name ?? "").toLowerCase();
        break;
      case "email":
        va = (a.email ?? "").toLowerCase();
        vb = (b.email ?? "").toLowerCase();
        break;
      case "org":
        va = (a.organizations?.name ?? "").toLowerCase();
        vb = (b.organizations?.name ?? "").toLowerCase();
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
  const [updateCustomer, { isLoading: updating }] = useUpdateCustomerMutation();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("joined");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filteredSorted = useMemo(() => {
    let list = customers ?? [];

    if (roleFilter !== "all") {
      list = list.filter((c) => c.role === roleFilter);
    }
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
          (c.email ?? "").toLowerCase().includes(term) ||
          (c.full_name ?? "").toLowerCase().includes(term) ||
          c.id.toLowerCase().includes(term) ||
          orgName.includes(term)
        );
      });
    }

    return sortCustomers(list, sortKey, sortDir);
  }, [customers, roleFilter, statusFilter, search, sortKey, sortDir]);

  function setSort(next: SortKey) {
    if (sortKey === next) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(next);
      setSortDir(next === "joined" || next === "leads" ? "desc" : "asc");
    }
  }

  const total = customers?.length ?? 0;
  const adminCount = useMemo(
    () => (customers ?? []).filter((c) => c.role === "customer_admin").length,
    [customers]
  );
  const agentCount = useMemo(
    () => (customers ?? []).filter((c) => c.role === "customer_agent").length,
    [customers]
  );
  const withOrg = useMemo(
    () => (customers ?? []).filter((c) => c.organization_id).length,
    [customers]
  );

  function exportCsv() {
    const headers = [
      "id",
      "full_name",
      "email",
      "role",
      "organization",
      "purchased_leads_org",
      "is_active",
      "created_at",
    ];
    const lines = filteredSorted.map((r) =>
      [
        r.id,
        r.full_name ?? "",
        r.email ?? "",
        r.role,
        r.organizations?.name ?? "",
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

  async function toggleActive(row: CustomerDirectoryRow) {
    const next = !row.is_active;
    if (!next && !confirm("Deactivate this customer? They will not be able to sign in.")) {
      return;
    }
    try {
      await updateCustomer({ id: row.id, is_active: next }).unwrap();
      toast.success(next ? "Customer activated" : "Customer deactivated");
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
          Client portal users (organization admins and agents). Accounts are
          created when people sign up on the client app.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/80 bg-card/50">
          <CardContent className="flex items-start gap-3 pt-6">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Contact className="size-5" aria-hidden />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total customers</p>
              <p className="text-2xl font-semibold tabular-nums">{total}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/80 bg-card/50">
          <CardContent className="flex items-start gap-3 pt-6">
            <div className="flex size-10 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
              <Building2 className="size-5" aria-hidden />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Org admins</p>
              <p className="text-2xl font-semibold tabular-nums">{adminCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/80 bg-card/50">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Agents</p>
            <p className="text-2xl font-semibold tabular-nums">{agentCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border/80 bg-card/50">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Linked to organization</p>
            <p className="text-2xl font-semibold tabular-nums">{withOrg}</p>
          </CardContent>
        </Card>
      </div>

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
                placeholder="Name, email, organization, user id"
                className="w-[260px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Role</Label>
              <Select
                value={roleFilter}
                onValueChange={(v) => setRoleFilter(v as RoleFilter)}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="customer_admin">Org admin</SelectItem>
                  <SelectItem value="customer_agent">Agent</SelectItem>
                </SelectContent>
              </Select>
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
                  <TableHead className="w-[100px]">User ID</TableHead>
                  <CustomerSortHead
                    label="Name"
                    column="name"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <CustomerSortHead
                    label="Email"
                    column="email"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <TableHead>Role</TableHead>
                  <CustomerSortHead
                    label="Organization"
                    column="org"
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
                        ? "No customer accounts yet."
                        : "No rows match your filters or search."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSorted.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {row.id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {row.full_name?.trim() || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.email ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            row.role === "customer_admin"
                              ? "bg-violet-500/15 text-violet-300 hover:bg-violet-500/25"
                              : "bg-sky-500/15 text-sky-300 hover:bg-sky-500/25"
                          }
                        >
                          {customerRoleLabel(row.role)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground">
                        {row.organizations?.name ?? (
                          <span className="italic opacity-70">None</span>
                        )}
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
                              disabled={updating}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => void copyEmail(row.email)}
                            >
                              Copy email
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => void toggleActive(row)}
                              disabled={typeof row.is_active !== "boolean"}
                            >
                              {row.is_active === false
                                ? "Activate account"
                                : "Deactivate account"}
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
    </div>
  );
}
