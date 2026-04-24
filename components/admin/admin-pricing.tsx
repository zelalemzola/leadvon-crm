"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  useGetCategoriesQuery,
  useGetPackagesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
  useCreatePackageMutation,
  useUpdatePackageMutation,
  useDeletePackageMutation,
  useGetOffersQuery,
  useCreateOfferMutation,
  useUpdateOfferMutation,
  useDeleteOfferMutation,
} from "@/lib/api/admin-api";
import { slugify } from "@/lib/slugify";
import type { Category, LeadOffer, LeadPackage, OfferWithPackage, PackageWithCategory } from "@/types/database";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Badge } from "@/components/ui/badge";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PrepaidEntitlementsPanel,
  PrepaidPricebookPanel,
} from "@/components/admin/admin-prepaid-panels";

export function AdminPricing() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
        <p className="text-sm text-muted-foreground">
          Lead categories and customer-facing packages (USD).
        </p>
      </header>
      <Tabs defaultValue="categories" className="w-full">
        <TabsList>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="packages">Packages</TabsTrigger>
          <TabsTrigger value="offers">Offers</TabsTrigger>
          <TabsTrigger value="prepaid">Prepaid</TabsTrigger>
        </TabsList>
        <TabsContent value="categories" className="mt-6">
          <CategoriesPanel />
        </TabsContent>
        <TabsContent value="packages" className="mt-6">
          <PackagesPanel />
        </TabsContent>
        <TabsContent value="offers" className="mt-6">
          <OffersPanel />
        </TabsContent>
        <TabsContent value="prepaid" className="mt-6 space-y-8">
          <PrepaidPricebookPanel />
          <PrepaidEntitlementsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CategoriesPanel() {
  const { data: categories, isLoading } = useGetCategoriesQuery();
  const { data: packages } = useGetPackagesQuery();
  const [createCategory, { isLoading: creating }] = useCreateCategoryMutation();
  const [updateCategory, { isLoading: updating }] = useUpdateCategoryMutation();
  const [deleteCategory, { isLoading: deleting }] = useDeleteCategoryMutation();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  function openCreate() {
    setEditing(null);
    setName("");
    setSlug("");
    setOpen(true);
  }

  function openEdit(c: Category) {
    setEditing(c);
    setName(c.name);
    setSlug(c.slug);
    setOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const s = slug.trim() || slugify(name);
    if (!name.trim() || !s) {
      toast.error("Name and slug are required");
      return;
    }
    try {
      if (editing) {
        await updateCategory({
          id: editing.id,
          name: name.trim(),
          slug: s,
        }).unwrap();
        toast.success("Category updated");
      } else {
        await createCategory({ name: name.trim(), slug: s }).unwrap();
        toast.success("Category created");
      }
      setOpen(false);
    } catch {
      toast.error("Could not save category (slug may already exist).");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this category? Packages referencing it may be affected."))
      return;
    try {
      await deleteCategory(id).unwrap();
      toast.success("Category deleted");
    } catch {
      toast.error("Delete failed — remove dependent packages first.");
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="size-4" aria-hidden />
          New category
        </Button>
      </div>
      <Card className="border-border/80 bg-card/50">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Packages</TableHead>
                  <TableHead>Avg package price</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(categories ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      No categories yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  (categories ?? []).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">{c.slug}</TableCell>
                      <TableCell>
                        {c.source_system === "base44" ? (
                          <Badge variant="secondary">Imported from Base44</Badge>
                        ) : (
                          <Badge variant="outline">Manual</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {
                          (packages ?? []).filter((p) => p.category_id === c.id)
                            .length
                        }
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatCategoryAvgPrice(packages ?? [], c.id)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Category actions"
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(c)}>
                              <Pencil className="size-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => void handleDelete(c.id)}
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
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={(e) => void handleSave(e)}>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit category" : "New category"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="cat-name">Name</Label>
                <Input
                  id="cat-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!editing) setSlug(slugify(e.target.value));
                  }}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cat-slug">Slug</Label>
                <Input
                  id="cat-slug"
                  value={slug}
                  onChange={(e) => setSlug(slugify(e.target.value))}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating || updating}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PackagesPanel() {
  const { data: categories } = useGetCategoriesQuery();
  const { data: packages, isLoading } = useGetPackagesQuery();
  const [createPackage, { isLoading: creating }] = useCreatePackageMutation();
  const [updatePackage, { isLoading: updating }] = useUpdatePackageMutation();
  const [deletePackage, { isLoading: deleting }] = useDeletePackageMutation();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PackageWithCategory | null>(null);
  const [form, setForm] = useState({
    category_id: "",
    name: "",
    description: "",
    price_dollars: "",
    leads_count: "1",
    active: true,
    stripe_price_id: "",
  });

  const defaultCat = categories?.[0]?.id ?? "";

  function openCreate() {
    setEditing(null);
    setForm({
      category_id: defaultCat,
      name: "",
      description: "",
      price_dollars: "",
      leads_count: "1",
      active: true,
      stripe_price_id: "",
    });
    setOpen(true);
  }

  function openEdit(p: PackageWithCategory) {
    setEditing(p);
    setForm({
      category_id: p.category_id,
      name: p.name,
      description: p.description,
      price_dollars: (p.price_cents / 100).toFixed(2),
      leads_count: String(p.leads_count),
      active: p.active,
      stripe_price_id: p.stripe_price_id ?? "",
    });
    setOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const price = Math.round(parseFloat(form.price_dollars) * 100);
    const count = parseInt(form.leads_count, 10);
    if (!form.category_id || !form.name.trim() || Number.isNaN(price) || price < 0) {
      toast.error("Check category, name, and price.");
      return;
    }
    if (Number.isNaN(count) || count < 1) {
      toast.error("Leads count must be at least 1.");
      return;
    }
    const payload: Omit<
      LeadPackage,
      "id" | "created_at" | "updated_at"
    > = {
      category_id: form.category_id,
      name: form.name.trim(),
      description: form.description.trim(),
      price_cents: price,
      currency: "USD",
      leads_count: count,
      stripe_price_id: form.stripe_price_id.trim() || null,
      active: form.active,
    };
    try {
      if (editing) {
        await updatePackage({ id: editing.id, ...payload }).unwrap();
        toast.success("Package updated");
      } else {
        await createPackage(payload).unwrap();
        toast.success("Package created");
      }
      setOpen(false);
    } catch {
      toast.error("Could not save package.");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this package?")) return;
    try {
      await deletePackage(id).unwrap();
      toast.success("Package deleted");
    } catch {
      toast.error("Could not delete package.");
    }
  }

  function formatMoney(cents: number, currency: string) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(cents / 100);
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={openCreate} disabled={!categories?.length}>
          <Plus className="size-4" aria-hidden />
          New package
        </Button>
      </div>

      {!categories?.length ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Add a category first</CardTitle>
            <CardDescription>
              Packages belong to a category. Create one in the Categories tab.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className="border-border/80 bg-card/50">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Package</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Leads</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Unit price</TableHead>
                    <TableHead>Stripe price ID</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(packages ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-24 text-center">
                        No packages yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (packages ?? []).map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>{p.categories?.name ?? "—"}</TableCell>
                        <TableCell>{p.leads_count}</TableCell>
                        <TableCell>
                          {formatMoney(p.price_cents, p.currency)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatMoney(
                            Math.round(p.price_cents / Math.max(1, p.leads_count)),
                            p.currency
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {p.stripe_price_id ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(p.updated_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {p.active ? (
                            <Badge className="bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25">
                              Active
                            </Badge>
                          ) : (
                            <Badge className="bg-rose-500/15 text-rose-300 hover:bg-rose-500/25">
                              Inactive
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Package actions"
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(p)}>
                                <Pencil className="size-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => void handleDelete(p.id)}
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
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={(e) => void handleSave(e)}>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit package" : "New package"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid max-h-[70vh] gap-4 overflow-y-auto py-4 pr-1">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={form.category_id}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, category_id: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Category" />
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
                <Label htmlFor="pkg-name">Name</Label>
                <Input
                  id="pkg-name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pkg-desc">Description</Label>
                <Textarea
                  id="pkg-desc"
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  rows={2}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pkg-price">Price (USD)</Label>
                  <Input
                    id="pkg-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.price_dollars}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, price_dollars: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pkg-count">Leads in bundle</Label>
                  <Input
                    id="pkg-count"
                    type="number"
                    min={1}
                    value={form.leads_count}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, leads_count: e.target.value }))
                    }
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="stripe-pid">Stripe price ID (optional)</Label>
                <Input
                  id="stripe-pid"
                  value={form.stripe_price_id}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      stripe_price_id: e.target.value,
                    }))
                  }
                  placeholder="price_..."
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="pkg-active"
                  className="size-4 rounded border-input"
                  checked={form.active}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, active: e.target.checked }))
                  }
                />
                <Label htmlFor="pkg-active" className="font-normal">
                  Active (visible to customers later)
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating || updating}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatCategoryAvgPrice(packages: PackageWithCategory[], categoryId: string) {
  const filtered = packages.filter((p) => p.category_id === categoryId);
  if (filtered.length === 0) return "—";
  const avgCents =
    filtered.reduce((acc, p) => acc + p.price_cents, 0) / filtered.length;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(avgCents / 100);
}

function OffersPanel() {
  const { data: packages } = useGetPackagesQuery();
  const { data: offers, isLoading } = useGetOffersQuery();
  const [createOffer, { isLoading: creating }] = useCreateOfferMutation();
  const [updateOffer, { isLoading: updating }] = useUpdateOfferMutation();
  const [deleteOffer, { isLoading: deleting }] = useDeleteOfferMutation();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OfferWithPackage | null>(null);
  const [form, setForm] = useState({
    package_id: "",
    title: "",
    description: "",
    discount_percent: "10",
    starts_at: "",
    ends_at: "",
    active: true,
  });

  function openCreate() {
    setEditing(null);
    setForm({
      package_id: packages?.[0]?.id ?? "",
      title: "",
      description: "",
      discount_percent: "10",
      starts_at: "",
      ends_at: "",
      active: true,
    });
    setOpen(true);
  }

  function openEdit(o: OfferWithPackage) {
    setEditing(o);
    setForm({
      package_id: o.package_id,
      title: o.title,
      description: o.description,
      discount_percent: String(o.discount_percent),
      starts_at: o.starts_at ? o.starts_at.slice(0, 16) : "",
      ends_at: o.ends_at ? o.ends_at.slice(0, 16) : "",
      active: o.active,
    });
    setOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const payload: Omit<LeadOffer, "id" | "created_at" | "updated_at"> = {
      package_id: form.package_id,
      title: form.title.trim(),
      description: form.description.trim(),
      discount_percent: Number(form.discount_percent),
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      active: form.active,
    };
    try {
      if (editing) {
        await updateOffer({ id: editing.id, ...payload }).unwrap();
        toast.success("Offer updated");
      } else {
        await createOffer(payload).unwrap();
        toast.success("Offer created");
      }
      setOpen(false);
    } catch {
      toast.error("Could not save offer.");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this offer?")) return;
    try {
      await deleteOffer(id).unwrap();
      toast.success("Offer deleted");
    } catch {
      toast.error("Could not delete offer.");
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={openCreate} disabled={!packages?.length}>
          <Plus className="size-4" aria-hidden />
          New offer
        </Button>
      </div>
      <Card className="border-border/80 bg-card/50">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(offers ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      No offers yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  (offers ?? []).map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.title}</TableCell>
                      <TableCell>{o.lead_packages?.name ?? "—"}</TableCell>
                      <TableCell>{o.discount_percent}%</TableCell>
                      <TableCell className="text-muted-foreground">
                        {o.starts_at ? new Date(o.starts_at).toLocaleDateString() : "Any"} -{" "}
                        {o.ends_at ? new Date(o.ends_at).toLocaleDateString() : "Open"}
                      </TableCell>
                      <TableCell>
                        {o.active ? (
                          <Badge className="bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25">
                            Active
                          </Badge>
                        ) : (
                          <Badge className="bg-rose-500/15 text-rose-300 hover:bg-rose-500/25">
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label="Offer actions">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(o)}>
                              <Pencil className="size-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => void handleDelete(o.id)}
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
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={(e) => void handleSave(e)}>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit offer" : "New offer"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Package</Label>
                <Select
                  value={form.package_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, package_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Package" />
                  </SelectTrigger>
                  <SelectContent>
                    {(packages ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-1">
                  <Label>Discount %</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={form.discount_percent}
                    onChange={(e) => setForm((f) => ({ ...f, discount_percent: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Starts</Label>
                  <Input
                    type="datetime-local"
                    value={form.starts_at}
                    onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ends</Label>
                  <Input
                    type="datetime-local"
                    value={form.ends_at}
                    onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                />
                <Label className="font-normal">Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating || updating}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
