"use client";

import { useMemo, useRef, useState } from "react";
import { Plus, MoreHorizontal, Pencil, Trash2, Upload, Download } from "lucide-react";
import { toast } from "sonner";
import {
  useGetCategoriesQuery,
  useGetLeadsQuery,
  useCreateLeadMutation,
  useUpdateLeadMutation,
  useDeleteLeadMutation,
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

const emptyForm = {
  category_id: "",
  phone: "",
  first_name: "",
  last_name: "",
  country: "",
  notes: "",
  sold: false,
};

export function AdminLeads() {
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
  const [editing, setEditing] = useState<LeadWithCategory | null>(null);
  const [form, setForm] = useState(emptyForm);
  const importRef = useRef<HTMLInputElement | null>(null);

  const { data: categories, isLoading: catLoading } = useGetCategoriesQuery();
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

  const loading = leadsLoading || catLoading;
  const rows = leads?.rows ?? [];
  const totalLeads = leads?.total ?? 0;
  const availableLeads = rows.filter((l) => !l.sold_at).length;
  const soldLeads = rows.length - availableLeads;

  const defaultCategoryId = useMemo(() => {
    return categories?.[0]?.id ?? "";
  }, [categories]);

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
      phone: row.phone,
      first_name: row.first_name,
      last_name: row.last_name,
      country: row.country ?? "",
      notes: row.notes,
      sold: Boolean(row.sold_at),
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.category_id) {
      toast.error("Select a category (create one under Pricing first).");
      return;
    }
    const payload = {
      category_id: form.category_id,
      phone: form.phone.trim(),
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      country: form.country.trim(),
      notes: form.notes.trim(),
      sold_at: form.sold ? new Date().toISOString() : null,
    };

    try {
      if (editing) {
        await updateLead({
          id: editing.id,
          ...payload,
        }).unwrap();
        toast.success("Lead updated");
      } else {
        await createLead({
          category_id: payload.category_id,
          phone: payload.phone,
          first_name: payload.first_name,
          last_name: payload.last_name,
          country: payload.country,
          notes: payload.notes,
          sold_at: payload.sold_at,
        }).unwrap();
        toast.success("Lead created");
      }
      setDialogOpen(false);
      setForm(emptyForm);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: { message?: string } }).data)
          : "Request failed";
      toast.error(msg);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this lead permanently?")) return;
    try {
      await deleteLead(id).unwrap();
      toast.success("Lead deleted");
    } catch {
      toast.error("Could not delete lead");
    }
  }

  function exportCsv() {
    const headers = [
      "id",
      "first_name",
      "last_name",
      "phone",
      "country",
      "category",
      "notes",
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
        r.categories?.name ?? "",
        (r.notes ?? "").replaceAll('"', '""'),
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
      toast.error("CSV appears empty.");
      return;
    }
    const header = lines[0].split(",").map((h) => h.trim().replaceAll('"', "").toLowerCase());
    const required = ["first_name", "last_name", "phone", "category"];
    const countryIdx = header.indexOf("country");
    for (const req of required) {
      if (!header.includes(req)) {
        toast.error(`Missing required CSV column: ${req}`);
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
        phone: String(row.phone ?? ""),
        first_name: String(row.first_name ?? ""),
        last_name: String(row.last_name ?? ""),
        country: countryVal || "Unknown",
        notes: String(row.notes ?? ""),
      }).unwrap();
      imported++;
    }
    toast.success(`Imported ${imported} leads`);
  }

  if (isError) {
    return (
      <div className="p-8">
        <p className="text-destructive">
          Failed to load leads:{" "}
          {error && typeof error === "object" && "data" in error
            ? String((error as { data?: unknown }).data)
            : "Unknown error"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
            <p className="text-sm text-muted-foreground">
              Inventory leads you can later sell to customers.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={exportCsv}>
              <Download className="size-4" />
              Export CSV
            </Button>
            <Button variant="outline" onClick={() => importRef.current?.click()}>
              <Upload className="size-4" />
              Import CSV
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
              New lead
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Search</Label>
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Name, phone, notes, country"
              className="w-[220px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Category</Label>
            <Select
              value={categoryFilter}
              onValueChange={(v) => {
                setCategoryFilter(v as typeof categoryFilter);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {(categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Availability</Label>
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
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="sold">Sold</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Country</Label>
            <Input
              value={countryFilter}
              onChange={(e) => {
                setCountryFilter(e.target.value);
                setPage(1);
              }}
              placeholder="Filter by country"
              className="w-[160px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Created from</Label>
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
            <Label className="text-xs text-muted-foreground">Created to</Label>
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
            <Label className="text-xs text-muted-foreground">Sort</Label>
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
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      {!categories?.length ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">No categories yet</CardTitle>
            <CardDescription>
              Create at least one category under{" "}
              <Link href="/admin/pricing" className="text-primary underline">
                Pricing
              </Link>{" "}
              before adding leads.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className="border-border/80 bg-card/50">
          <CardHeader className="border-b border-border/70 py-4">
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <Badge variant="outline" className="border-primary/40 text-primary">
                Total: {totalLeads}
              </Badge>
              <Badge className="bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25">
                Available (page): {availableLeads}
              </Badge>
              <Badge className="bg-rose-500/15 text-rose-300 hover:bg-rose-500/25">
                Sold (page): {soldLeads}
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
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-24 text-center">
                        No leads match this filter.
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
                          {row.country || "—"}
                        </TableCell>
                        <TableCell>
                          {row.categories?.name ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate text-muted-foreground">
                          {row.notes || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(row.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {row.sold_at ? (
                            <Badge className="bg-rose-500/15 text-rose-300 hover:bg-rose-500/25">
                              Sold
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25">
                              Available
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Lead actions"
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(row)}>
                                <Pencil className="size-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => void handleDelete(row.id)}
                                disabled={deleting}
                              >
                                <Trash2 className="size-4" />
                                Delete
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
              Showing {rows.length} of {totalLeads} leads
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <span className="text-muted-foreground">Page {page}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={page * 20 >= totalLeads}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={(e) => void handleSubmit(e)}>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit lead" : "New lead"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={form.category_id}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, category_id: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
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
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First name</Label>
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
                  <Label htmlFor="last_name">Last name</Label>
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
                <Label htmlFor="phone">Phone</Label>
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
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={form.country}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, country: e.target.value }))
                  }
                  placeholder="e.g. United States"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
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
                  Mark as sold (inventory no longer available)
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating || updating}>
                {editing ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
