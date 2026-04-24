"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  useGetSupportContactsQuery,
  useCreateSupportContactMutation,
  useUpdateSupportContactMutation,
  useDeleteSupportContactMutation,
} from "@/lib/api/admin-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";

export function AdminSupport() {
  const { t } = useI18n();
  const { data: rows, isLoading } = useGetSupportContactsQuery();
  const [createRow, { isLoading: creating }] = useCreateSupportContactMutation();
  const [updateRow] = useUpdateSupportContactMutation();
  const [deleteRow] = useDeleteSupportContactMutation();

  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState(0);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createRow({
        title,
        email: email.trim() || null,
        phone: phone.trim() || null,
        description,
        sort_order: sortOrder,
        organization_id: null,
      }).unwrap();
      toast.success(t("admin.support.toastAdded"));
      setTitle("");
      setEmail("");
      setPhone("");
      setDescription("");
      setSortOrder(0);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : t("admin.support.toastCreateFailed");
      toast.error(msg);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("admin.support.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("admin.support.subtitle")}
        </p>
      </header>

      <Card className="max-w-2xl border-border/70 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">{t("admin.support.addContact")}</CardTitle>
          <CardDescription>{t("admin.support.addContactHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onCreate(e)} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("admin.support.fieldTitle")}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.support.fieldEmail")}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.support.fieldPhone")}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("admin.support.fieldDescription")}</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.support.fieldSortOrder")}</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={creating}>
                {creating ? t("admin.support.saving") : t("admin.support.add")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">{t("admin.support.contacts")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.support.fieldTitle")}</TableHead>
                <TableHead>{t("admin.support.fieldEmail")}</TableHead>
                <TableHead>{t("admin.support.fieldPhone")}</TableHead>
                <TableHead>{t("admin.support.fieldDescription")}</TableHead>
                <TableHead>{t("admin.support.colOrder")}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-16 text-center">
                    {t("admin.support.loading")}
                  </TableCell>
                </TableRow>
              ) : (rows ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-16 text-center">
                    {t("admin.support.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                (rows ?? []).map((r) => (
                  <SupportRow
                    key={r.id}
                    row={r}
                    onSave={async (patch) => {
                      try {
                        await updateRow({ id: r.id, ...patch }).unwrap();
                        toast.success(t("admin.support.toastUpdated"));
                      } catch (err: unknown) {
                        const msg =
                          err && typeof err === "object" && "data" in err
                            ? String((err as { data?: unknown }).data)
                            : t("admin.support.toastUpdateFailed");
                        toast.error(msg);
                      }
                    }}
                    onDelete={async () => {
                      try {
                        await deleteRow(r.id).unwrap();
                        toast.success(t("admin.support.toastDeleted"));
                      } catch (err: unknown) {
                        const msg =
                          err && typeof err === "object" && "data" in err
                            ? String((err as { data?: unknown }).data)
                            : t("admin.support.toastDeleteFailed");
                        toast.error(msg);
                      }
                    }}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SupportRow({
  row,
  onSave,
  onDelete,
}: {
  row: {
    id: string;
    title: string;
    email: string | null;
    phone: string | null;
    description: string;
    sort_order: number;
  };
  onSave: (patch: Partial<typeof row>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState(row.title);
  const [email, setEmail] = useState(row.email ?? "");
  const [phone, setPhone] = useState(row.phone ?? "");
  const [description, setDescription] = useState(row.description);
  const [sortOrder, setSortOrder] = useState(row.sort_order);

  return (
    <TableRow>
      <TableCell>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8" />
      </TableCell>
      <TableCell>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} className="h-8" />
      </TableCell>
      <TableCell>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-8" />
      </TableCell>
      <TableCell>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="h-8 min-w-[140px]"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
          className="h-8 w-16"
        />
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() =>
                void onSave({
                  title,
                  email: email.trim() || null,
                  phone: phone.trim() || null,
                  description,
                  sort_order: sortOrder,
                })
              }
            >
              {t("admin.support.saveChanges")}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => void onDelete()}>
              <Trash2 className="mr-2 size-4" />
              {t("admin.support.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
