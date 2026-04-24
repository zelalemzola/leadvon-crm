"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  useGetStaffQuery,
  useInviteStaffMutation,
  useUpdateStaffMutation,
} from "@/lib/api/admin-api";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";

export function AdminStaff() {
  const { t } = useI18n();
  const { data: staff, isLoading, isError, error } = useGetStaffQuery();
  const [invite, { isLoading: inviting }] = useInviteStaffMutation();
  const [updateStaff, { isLoading: updatingStaff }] = useUpdateStaffMutation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [search, setSearch] = useState("");
  const [newPasswordById, setNewPasswordById] = useState<Record<string, string>>({});

  const filteredStaff = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return staff ?? [];
    return (staff ?? []).filter(
      (s) =>
        (s.email ?? "").toLowerCase().includes(term) ||
        (s.full_name ?? "").toLowerCase().includes(term) ||
        s.id.toLowerCase().includes(term)
    );
  }, [search, staff]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    try {
      await invite({ email, password, full_name: fullName }).unwrap();
      toast.success(t("adminStaff.staffCreated"));
      setEmail("");
      setPassword("");
      setFullName("");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : t("adminStaff.couldNotCreateUser");
      toast.error(msg);
    }
  }

  async function toggleActive(id: string, current: boolean) {
    try {
      await updateStaff({ id, is_active: !current }).unwrap();
      toast.success(!current ? t("adminStaff.staffActivated") : t("adminStaff.staffDeactivated"));
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : t("adminStaff.couldNotUpdateStatus");
      toast.error(msg);
    }
  }

  async function resetPassword(id: string) {
    const next = newPasswordById[id]?.trim();
    if (!next || next.length < 8) {
      toast.error(t("adminStaff.passwordMin"));
      return;
    }
    try {
      await updateStaff({ id, password: next }).unwrap();
      toast.success(t("adminStaff.passwordUpdated"));
      setNewPasswordById((m) => ({ ...m, [id]: "" }));
    } catch {
      toast.error(t("adminStaff.couldNotResetPassword"));
    }
  }

  if (isError) {
    return (
      <div className="p-8">
        <p className="text-destructive">
          {t("adminStaff.failedToLoad")}{" "}
          {error && typeof error === "object" && "data" in error
            ? String((error as { data?: unknown }).data)
            : t("adminStaff.unknownError")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-8 p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("adminStaff.title")}</h1>
        {/* <p className="text-sm text-muted-foreground">
          Create admin accounts with the staff role. Requires{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            SUPABASE_SERVICE_ROLE_KEY
          </code>{" "}
          on the server.
        </p> */}
      </header>


      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border/80 bg-card/50">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">{t("adminStaff.totalStaff")}</p>
            <p className="text-2xl font-semibold">{staff?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-border/80 bg-card/50">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">{t("adminStaff.accountsWithName")}</p>
            <p className="text-2xl font-semibold">
              {(staff ?? []).filter((s) => Boolean(s.full_name)).length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/80 bg-card/50">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">{t("adminStaff.missingNames")}</p>
            <p className="text-2xl font-semibold">
              {(staff ?? []).filter((s) => !s.full_name).length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="max-w-xl border-border/80 bg-card/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="size-4" aria-hidden />
            {t("adminStaff.inviteStaffUser")}
          </CardTitle>
          <CardDescription>
            {t("adminStaff.inviteHint")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleInvite(e)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="st-email">{t("adminStaff.email")}</Label>
              <Input
                id="st-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="st-pass">{t("adminStaff.temporaryPassword")}</Label>
              <Input
                id="st-pass"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="st-name">{t("adminStaff.fullNameOptional")}</Label>
              <Input
                id="st-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={inviting}>
              {inviting ? t("adminStaff.creating") : t("adminStaff.createStaffUser")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">{t("adminStaff.staffAccounts")}</CardTitle>
          <CardDescription>{t("adminStaff.staffAccountsDesc")}</CardDescription>
          <div className="pt-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("adminStaff.searchPlaceholder")}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
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
                  <TableHead>{t("adminStaff.userId")}</TableHead>
                  <TableHead>{t("adminStaff.email")}</TableHead>
                  <TableHead>{t("adminStaff.name")}</TableHead>
                  <TableHead>{t("adminStaff.role")}</TableHead>
                  <TableHead>{t("adminStaff.status")}</TableHead>
                  <TableHead>{t("adminStaff.resetPassword")}</TableHead>
                  <TableHead>{t("adminStaff.created")}</TableHead>
                  <TableHead>{t("adminStaff.updated")}</TableHead>
                  <TableHead className="text-right">{t("adminStaff.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStaff.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center">
                      {t("adminStaff.noRowsYet")}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStaff.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {s.id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {s.email ?? t("admin.dashboard.na")}
                      </TableCell>
                      <TableCell>{s.full_name ?? t("admin.dashboard.na")}</TableCell>
                      <TableCell>
                        <Badge className="bg-violet-500/15 text-violet-300 hover:bg-violet-500/25">
                          {t("adminStaff.staff")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {typeof s.is_active !== "boolean" ? (
                          <Badge className="bg-amber-500/15 text-amber-300 hover:bg-amber-500/25">
                            {t("adminStaff.unknown")}
                          </Badge>
                        ) : s.is_active ? (
                          <Badge className="bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25">
                            {t("adminStaff.active")}
                          </Badge>
                        ) : (
                          <Badge className="bg-rose-500/15 text-rose-300 hover:bg-rose-500/25">
                            {t("adminStaff.inactive")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="min-w-52">
                        <div className="flex items-center gap-2">
                          <Input
                            type="password"
                            placeholder={t("adminStaff.newPassword")}
                            value={newPasswordById[s.id] ?? ""}
                            onChange={(e) =>
                              setNewPasswordById((m) => ({
                                ...m,
                                [s.id]: e.target.value,
                              }))
                            }
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void resetPassword(s.id)}
                            disabled={updatingStaff}
                          >
                            {t("adminStaff.set")}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(s.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(s.updated_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                typeof s.is_active === "boolean"
                                  ? void toggleActive(s.id, s.is_active)
                                  : toast.error(
                                      t("adminStaff.statusColumnMissing")
                                    )
                              }
                              disabled={updatingStaff}
                            >
                              {typeof s.is_active !== "boolean"
                                ? t("adminStaff.statusUnavailable")
                                : s.is_active
                                  ? t("adminStaff.deactivate")
                                  : t("adminStaff.activate")}
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
