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
import { useI18n } from "@/components/providers/i18n-provider";

export function ClientSettings() {
  const { t } = useI18n();
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
      toast.error(t("clientSettings.onlyAdminsCreate"));
      return;
    }
    try {
      await createUser({ email, password, full_name: fullName, role }).unwrap();
      toast.success(t("clientSettings.userCreated"));
      setEmail("");
      setPassword("");
      setFullName("");
      setRole("customer_agent");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : t("clientSettings.couldNotCreateUser");
      toast.error(msg);
    }
  }

  async function toggleUserStatus(id: string, isActive: boolean) {
    try {
      await updateUser({ id, is_active: !isActive }).unwrap();
      toast.success(`${t("clientSettings.user")} ${isActive ? t("clientSettings.deactivated") : t("clientSettings.activated")}`);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : t("clientSettings.couldNotUpdateUser");
      toast.error(msg);
    }
  }

  async function changeRole(id: string, nextRole: "customer_admin" | "customer_agent") {
    try {
      await updateUser({ id, role: nextRole }).unwrap();
      toast.success(t("clientSettings.roleUpdated"));
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : t("clientSettings.couldNotUpdateRole");
      toast.error(msg);
    }
  }

  async function sendResetLink(id: string) {
    try {
      const res = await updateUser({ id, send_password_reset: true }).unwrap();
      if (res.reset_link && navigator?.clipboard) {
        await navigator.clipboard.writeText(res.reset_link);
        toast.success(t("clientSettings.resetLinkCopied"));
      } else {
        toast.success(t("clientSettings.resetLinkGenerated"));
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : t("clientSettings.couldNotGenerateResetLink");
      toast.error(msg);
    }
  }

  async function setTempPassword(id: string) {
    const value = tempPasswordByUser[id]?.trim();
    if (!value || value.length < 8) {
      toast.error(t("clientSettings.tempPasswordMin"));
      return;
    }
    try {
      await updateUser({ id, password: value }).unwrap();
      toast.success(t("clientSettings.tempPasswordUpdated"));
      setTempPasswordByUser((m) => ({ ...m, [id]: "" }));
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : t("clientSettings.couldNotUpdatePassword");
      toast.error(msg);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("clientSettings.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("clientSettings.subtitle")}
        </p>
      </header>

      <Card className="max-w-2xl border-border/70 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">{t("clientSettings.createTeamUser")}</CardTitle>
          <CardDescription>
            {t("clientSettings.createTeamUserDesc")} {isOrgAdmin ? "" : t("clientSettings.onlyAdminsCreate")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void submit(e)} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("clientSettings.email")}</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} required disabled={!isOrgAdmin} />
            </div>
            <div className="space-y-2">
              <Label>{t("clientSettings.password")}</Label>
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
              <Label>{t("clientSettings.role")}</Label>
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)} disabled={!isOrgAdmin}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer_agent">{t("clientSettings.customerAgent")}</SelectItem>
                  <SelectItem value="customer_admin">{t("clientSettings.customerAdmin")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("clientSettings.fullNameOptional")}</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={!isOrgAdmin} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={creating || !isOrgAdmin}>
                {creating ? t("clientSettings.creating") : t("clientSettings.createUser")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">{t("clientSettings.organizationUsers")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("clientSettings.email")}</TableHead>
                <TableHead>{t("clientSettings.name")}</TableHead>
                <TableHead>{t("clientSettings.role")}</TableHead>
                <TableHead>{t("clientSettings.status")}</TableHead>
                <TableHead>{t("clientSettings.actions")}</TableHead>
                <TableHead>{t("clientSettings.lastLogin")}</TableHead>
                <TableHead>{t("clientSettings.created")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="h-16 text-center">{t("clientSettings.loading")}</TableCell></TableRow>
              ) : (users ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={7} className="h-16 text-center">{t("clientSettings.noUsersYet")}</TableCell></TableRow>
              ) : (
                (users ?? []).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.email ?? t("clientDashboard.na")}</TableCell>
                    <TableCell>{u.full_name ?? t("clientDashboard.na")}</TableCell>
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
                          <SelectItem value="customer_agent">{t("clientSettings.customerAgent")}</SelectItem>
                          <SelectItem value="customer_admin">{t("clientSettings.customerAdmin")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {u.is_active ? (
                        <Badge className="bg-emerald-500/15 text-emerald-300">{t("clientSettings.active")}</Badge>
                      ) : (
                        <Badge className="bg-rose-500/15 text-rose-300">{t("clientSettings.inactive")}</Badge>
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
                          {u.is_active ? t("clientSettings.deactivate") : t("clientSettings.activate")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!isOrgAdmin || updatingUser}
                          onClick={() => void sendResetLink(u.id)}
                        >
                          {t("clientSettings.resetLink")}
                        </Button>
                        <Input
                          value={tempPasswordByUser[u.id] ?? ""}
                          onChange={(e) =>
                            setTempPasswordByUser((m) => ({ ...m, [u.id]: e.target.value }))
                          }
                          placeholder={t("clientSettings.tempPassword")}
                          className="h-8 w-36"
                          disabled={!isOrgAdmin || updatingUser}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!isOrgAdmin || updatingUser}
                          onClick={() => void setTempPassword(u.id)}
                        >
                          {t("clientSettings.setPassword")}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.last_sign_in_at
                        ? new Date(u.last_sign_in_at).toLocaleString()
                        : t("clientSettings.never")}
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
