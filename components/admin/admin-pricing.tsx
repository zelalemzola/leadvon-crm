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
import { useI18n } from "@/components/providers/i18n-provider";

export function AdminPricing() {
  const { t } = useI18n();
  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("adminPricing.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("adminPricing.subtitle")}
        </p>
      </header>
      <Tabs defaultValue="categories" className="w-full">
        <TabsList>
          <TabsTrigger value="categories">{t("adminPricing.categories")}</TabsTrigger>
          <TabsTrigger value="packages">{t("adminPricing.packages")}</TabsTrigger>
          <TabsTrigger value="offers">{t("adminPricing.offers")}</TabsTrigger>
          <TabsTrigger value="prepaid">{t("adminPricing.prepaid")}</TabsTrigger>
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
  const { t } = useI18n();
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
      toast.error(t("adminPricing.nameSlugRequired"));
      return;
    }
    try {
      if (editing) {
        await updateCategory({
          id: editing.id,
          name: name.trim(),
          slug: s,
        }).unwrap();
        toast.success(t("adminPricing.categoryUpdated"));
      } else {
        await createCategory({ name: name.trim(), slug: s }).unwrap();
        toast.success(t("adminPricing.categoryCreated"));
      }
      setOpen(false);
    } catch {
      toast.error(t("adminPricing.couldNotSaveCategory"));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("adminPricing.confirmDeleteCategory")))
      return;
    try {
      await deleteCategory(id).unwrap();
      toast.success(t("adminPricing.categoryDeleted"));
    } catch {
      toast.error(t("adminPricing.deleteCategoryFailed"));
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="size-4" aria-hidden />
          {t("adminPricing.newCategory")}
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
                  <TableHead>{t("adminPricing.name")}</TableHead>
                  <TableHead>{t("adminPricing.slug")}</TableHead>
                  <TableHead>{t("adminPricing.source")}</TableHead>
                  <TableHead>{t("adminPricing.packages")}</TableHead>
                  <TableHead>{t("adminPricing.avgPackagePrice")}</TableHead>
                  <TableHead className="text-right">{t("adminPricing.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(categories ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      {t("adminPricing.noCategoriesYet")}
                    </TableCell>
                  </TableRow>
                ) : (
                  (categories ?? []).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">{c.slug}</TableCell>
                      <TableCell>
                        {c.source_system === "base44" ? (
                          <Badge variant="secondary">{t("adminPricing.importedFromBase44")}</Badge>
                        ) : (
                          <Badge variant="outline">{t("adminPricing.manual")}</Badge>
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
                                aria-label={t("adminPricing.categoryActions")}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(c)}>
                              <Pencil className="size-4" />
                              {t("adminPricing.edit")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => void handleDelete(c.id)}
                              disabled={deleting}
                            >
                              <Trash2 className="size-4" />
                              {t("adminPricing.delete")}
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
                {editing ? t("adminPricing.editCategory") : t("adminPricing.newCategory")}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="cat-name">{t("adminPricing.name")}</Label>
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
                <Label htmlFor="cat-slug">{t("adminPricing.slug")}</Label>
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
                {t("adminPricing.cancel")}
              </Button>
              <Button type="submit" disabled={creating || updating}>
                {t("adminPricing.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PackagesPanel() {
  const { t } = useI18n();
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
      toast.error(t("adminPricing.checkCategoryNamePrice"));
      return;
    }
    if (Number.isNaN(count) || count < 1) {
      toast.error(t("adminPricing.leadsCountMin"));
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
        toast.success(t("adminPricing.packageUpdated"));
      } else {
        await createPackage(payload).unwrap();
        toast.success(t("adminPricing.packageCreated"));
      }
      setOpen(false);
    } catch {
      toast.error(t("adminPricing.couldNotSavePackage"));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("adminPricing.confirmDeletePackage"))) return;
    try {
      await deletePackage(id).unwrap();
      toast.success(t("adminPricing.packageDeleted"));
    } catch {
      toast.error(t("adminPricing.couldNotDeletePackage"));
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
          {t("adminPricing.newPackage")}
        </Button>
      </div>

      {!categories?.length ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">{t("adminPricing.addCategoryFirst")}</CardTitle>
            <CardDescription>
              {t("adminPricing.packagesBelongToCategory")}
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
                    <TableHead>{t("adminPricing.package")}</TableHead>
                    <TableHead>{t("adminPricing.category")}</TableHead>
                    <TableHead>{t("adminPricing.leads")}</TableHead>
                    <TableHead>{t("adminPricing.price")}</TableHead>
                    <TableHead>{t("adminPricing.unitPrice")}</TableHead>
                    <TableHead>{t("adminPricing.stripePriceId")}</TableHead>
                    <TableHead>{t("adminPricing.updated")}</TableHead>
                    <TableHead>{t("adminPricing.status")}</TableHead>
                    <TableHead className="text-right">{t("adminPricing.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(packages ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-24 text-center">
                        {t("adminPricing.noPackagesYet")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    (packages ?? []).map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>{p.categories?.name ?? t("admin.dashboard.na")}</TableCell>
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
                          {p.stripe_price_id ?? t("admin.dashboard.na")}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(p.updated_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {p.active ? (
                            <Badge className="bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25">
                              {t("adminPricing.active")}
                            </Badge>
                          ) : (
                            <Badge className="bg-rose-500/15 text-rose-300 hover:bg-rose-500/25">
                              {t("adminPricing.inactive")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t("adminPricing.packageActions")}
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(p)}>
                                <Pencil className="size-4" />
                                {t("adminPricing.edit")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => void handleDelete(p.id)}
                                disabled={deleting}
                              >
                                <Trash2 className="size-4" />
                                {t("adminPricing.delete")}
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
                {editing ? t("adminPricing.editPackage") : t("adminPricing.newPackage")}
              </DialogTitle>
            </DialogHeader>
            <div className="grid max-h-[70vh] gap-4 overflow-y-auto py-4 pr-1">
              <div className="space-y-2">
                <Label>{t("adminPricing.category")}</Label>
                <Select
                  value={form.category_id}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, category_id: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("adminPricing.category")} />
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
                <Label htmlFor="pkg-name">{t("adminPricing.name")}</Label>
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
                <Label htmlFor="pkg-desc">{t("adminPricing.description")}</Label>
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
                  <Label htmlFor="pkg-price">{t("adminPricing.priceUsd")}</Label>
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
                  <Label htmlFor="pkg-count">{t("adminPricing.leadsInBundle")}</Label>
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
                <Label htmlFor="stripe-pid">{t("adminPricing.stripePriceIdOptional")}</Label>
                <Input
                  id="stripe-pid"
                  value={form.stripe_price_id}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      stripe_price_id: e.target.value,
                    }))
                  }
                  placeholder={t("adminPricing.stripePricePlaceholder")}
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
                  {t("adminPricing.activeVisibleLater")}
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t("adminPricing.cancel")}
              </Button>
              <Button type="submit" disabled={creating || updating}>
                {t("adminPricing.save")}
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
  const { t } = useI18n();
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
        toast.success(t("adminPricing.offerUpdated"));
      } else {
        await createOffer(payload).unwrap();
        toast.success(t("adminPricing.offerCreated"));
      }
      setOpen(false);
    } catch {
      toast.error(t("adminPricing.couldNotSaveOffer"));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("adminPricing.confirmDeleteOffer"))) return;
    try {
      await deleteOffer(id).unwrap();
      toast.success(t("adminPricing.offerDeleted"));
    } catch {
      toast.error(t("adminPricing.couldNotDeleteOffer"));
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={openCreate} disabled={!packages?.length}>
          <Plus className="size-4" aria-hidden />
          {t("adminPricing.newOffer")}
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
                  <TableHead>{t("adminPricing.titleCol")}</TableHead>
                  <TableHead>{t("adminPricing.package")}</TableHead>
                  <TableHead>{t("adminPricing.discount")}</TableHead>
                  <TableHead>{t("adminPricing.window")}</TableHead>
                  <TableHead>{t("adminPricing.status")}</TableHead>
                  <TableHead className="text-right">{t("adminPricing.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(offers ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      {t("adminPricing.noOffersYet")}
                    </TableCell>
                  </TableRow>
                ) : (
                  (offers ?? []).map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.title}</TableCell>
                      <TableCell>{o.lead_packages?.name ?? t("admin.dashboard.na")}</TableCell>
                      <TableCell>{o.discount_percent}%</TableCell>
                      <TableCell className="text-muted-foreground">
                        {o.starts_at ? new Date(o.starts_at).toLocaleDateString() : t("adminPricing.any")} -{" "}
                        {o.ends_at ? new Date(o.ends_at).toLocaleDateString() : t("adminPricing.open")}
                      </TableCell>
                      <TableCell>
                        {o.active ? (
                          <Badge className="bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25">
                            {t("adminPricing.active")}
                          </Badge>
                        ) : (
                          <Badge className="bg-rose-500/15 text-rose-300 hover:bg-rose-500/25">
                            {t("adminPricing.inactive")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={t("adminPricing.offerActions")}>
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(o)}>
                              <Pencil className="size-4" />
                              {t("adminPricing.edit")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => void handleDelete(o.id)}
                              disabled={deleting}
                            >
                              <Trash2 className="size-4" />
                              {t("adminPricing.delete")}
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
              <DialogTitle>{editing ? t("adminPricing.editOffer") : t("adminPricing.newOffer")}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>{t("adminPricing.package")}</Label>
                <Select
                  value={form.package_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, package_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("adminPricing.package")} />
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
                <Label>{t("adminPricing.titleCol")}</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>{t("adminPricing.description")}</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-1">
                  <Label>{t("adminPricing.discountPercent")}</Label>
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
                  <Label>{t("adminPricing.starts")}</Label>
                  <Input
                    type="datetime-local"
                    value={form.starts_at}
                    onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("adminPricing.ends")}</Label>
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
                <Label className="font-normal">{t("adminPricing.active")}</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t("adminPricing.cancel")}
              </Button>
              <Button type="submit" disabled={creating || updating}>
                {t("adminPricing.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
