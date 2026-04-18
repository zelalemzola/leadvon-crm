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

export function AdminSupport() {
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
      toast.success("Contact added");
      setTitle("");
      setEmail("");
      setPhone("");
      setDescription("");
      setSortOrder(0);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : "Could not create";
      toast.error(msg);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Support contacts</h1>
        <p className="text-sm text-muted-foreground">
          Shown to all customer organizations (global contacts).
        </p>
      </header>

      <Card className="max-w-2xl border-border/70 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">Add contact</CardTitle>
          <CardDescription>Email or phone can be empty if not applicable.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onCreate(e)} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Sort order</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={creating}>
                {creating ? "Saving..." : "Add"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">Contacts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Order</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-16 text-center">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : (rows ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-16 text-center">
                    No contacts yet.
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
                        toast.success("Updated");
                      } catch (err: unknown) {
                        const msg =
                          err && typeof err === "object" && "data" in err
                            ? String((err as { data?: unknown }).data)
                            : "Update failed";
                        toast.error(msg);
                      }
                    }}
                    onDelete={async () => {
                      try {
                        await deleteRow(r.id).unwrap();
                        toast.success("Deleted");
                      } catch (err: unknown) {
                        const msg =
                          err && typeof err === "object" && "data" in err
                            ? String((err as { data?: unknown }).data)
                            : "Delete failed";
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
              Save changes
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => void onDelete()}>
              <Trash2 className="mr-2 size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
