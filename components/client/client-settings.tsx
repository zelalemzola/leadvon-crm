"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  useCreateOrgUserMutation,
  useGetClientMeQuery,
  useGetOrgUsersQuery,
  useUpdateOrgUserMutation,
} from "@/lib/api/client-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export function ClientSettings() {
  const { data: me } = useGetClientMeQuery();
  const { data: users, isLoading } = useGetOrgUsersQuery();
  const [createUser, { isLoading: creating }] = useCreateOrgUserMutation();
  const [updateUser, { isLoading: updatingUser }] = useUpdateOrgUserMutation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tempPasswordByUser, setTempPasswordByUser] = useState<Record<string, string>>({});
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"customer_admin" | "customer_agent">("customer_agent");
  const isOrgAdmin = me?.role === "customer_admin" && me?.is_active;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isOrgAdmin) {
      toast.error("Only customer admins can create users.");
      return;
    }
    try {
      await createUser({ email, password, full_name: fullName, role }).unwrap();
      toast.success("User created");
      setEmail("");
      setPassword("");
      setFullName("");
      setRole("customer_agent");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : "Could not create user";
      toast.error(msg);
    }
  }

  async function toggleUserStatus(id: string, isActive: boolean) {
    try {
      await updateUser({ id, is_active: !isActive }).unwrap();
      toast.success(`User ${isActive ? "deactivated" : "activated"}`);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : "Could not update user";
      toast.error(msg);
    }
  }

  async function changeRole(id: string, nextRole: "customer_admin" | "customer_agent") {
    try {
      await updateUser({ id, role: nextRole }).unwrap();
      toast.success("Role updated");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : "Could not update role";
      toast.error(msg);
    }
  }

  async function sendResetLink(id: string) {
    try {
      const res = await updateUser({ id, send_password_reset: true }).unwrap();
      if (res.reset_link && navigator?.clipboard) {
        await navigator.clipboard.writeText(res.reset_link);
        toast.success("Reset link generated and copied.");
      } else {
        toast.success("Reset link generated.");
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : "Could not generate reset link";
      toast.error(msg);
    }
  }

  async function setTempPassword(id: string) {
    const value = tempPasswordByUser[id]?.trim();
    if (!value || value.length < 8) {
      toast.error("Temporary password must be at least 8 characters.");
      return;
    }
    try {
      await updateUser({ id, password: value }).unwrap();
      toast.success("Temporary password updated");
      setTempPasswordByUser((m) => ({ ...m, [id]: "" }));
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : "Could not update password";
      toast.error(msg);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your organization users and access roles.
        </p>
      </header>

      <Card className="max-w-2xl border-border/70 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">Create team user</CardTitle>
          <CardDescription>
            Add agents or admins to your organization. {isOrgAdmin ? "" : "Only customer admins can create users."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void submit(e)} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} required disabled={!isOrgAdmin} />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                disabled={!isOrgAdmin}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)} disabled={!isOrgAdmin}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer_agent">Customer Agent</SelectItem>
                  <SelectItem value="customer_admin">Customer Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Full name (optional)</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={!isOrgAdmin} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={creating || !isOrgAdmin}>
                {creating ? "Creating..." : "Create user"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">Organization users</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="h-16 text-center">Loading...</TableCell></TableRow>
              ) : (users ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={7} className="h-16 text-center">No users yet.</TableCell></TableRow>
              ) : (
                (users ?? []).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.email ?? "—"}</TableCell>
                    <TableCell>{u.full_name ?? "—"}</TableCell>
                    <TableCell>
                      <Select
                        value={u.role}
                        onValueChange={(v) =>
                          void changeRole(u.id, v as "customer_admin" | "customer_agent")
                        }
                        disabled={!isOrgAdmin || updatingUser}
                      >
                        <SelectTrigger className="h-8 w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="customer_agent">Customer Agent</SelectItem>
                          <SelectItem value="customer_admin">Customer Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {u.is_active ? (
                        <Badge className="bg-emerald-500/15 text-emerald-300">Active</Badge>
                      ) : (
                        <Badge className="bg-rose-500/15 text-rose-300">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant={u.is_active ? "destructive" : "outline"}
                          disabled={!isOrgAdmin || updatingUser || me?.id === u.id}
                          onClick={() => void toggleUserStatus(u.id, u.is_active)}
                        >
                          {u.is_active ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!isOrgAdmin || updatingUser}
                          onClick={() => void sendResetLink(u.id)}
                        >
                          Reset Link
                        </Button>
                        <Input
                          value={tempPasswordByUser[u.id] ?? ""}
                          onChange={(e) =>
                            setTempPasswordByUser((m) => ({ ...m, [u.id]: e.target.value }))
                          }
                          placeholder="Temp password"
                          className="h-8 w-36"
                          disabled={!isOrgAdmin || updatingUser}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!isOrgAdmin || updatingUser}
                          onClick={() => void setTempPassword(u.id)}
                        >
                          Set Password
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.last_sign_in_at
                        ? new Date(u.last_sign_in_at).toLocaleString()
                        : "Never"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
