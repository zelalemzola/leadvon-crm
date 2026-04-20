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

export function AdminStaff() {
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
      toast.success("Staff user created");
      setEmail("");
      setPassword("");
      setFullName("");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : "Could not create user";
      toast.error(msg);
    }
  }

  async function toggleActive(id: string, current: boolean) {
    try {
      await updateStaff({ id, is_active: !current }).unwrap();
      toast.success(!current ? "Staff activated" : "Staff deactivated");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : "Could not update staff status";
      toast.error(msg);
    }
  }

  async function resetPassword(id: string) {
    const next = newPasswordById[id]?.trim();
    if (!next || next.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    try {
      await updateStaff({ id, password: next }).unwrap();
      toast.success("Password updated");
      setNewPasswordById((m) => ({ ...m, [id]: "" }));
    } catch {
      toast.error("Could not reset password");
    }
  }

  if (isError) {
    return (
      <div className="p-8">
        <p className="text-destructive">
          Failed to load staff:{" "}
          {error && typeof error === "object" && "data" in error
            ? String((error as { data?: unknown }).data)
            : "Unknown error"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-8 p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
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
            <p className="text-xs text-muted-foreground">Total staff</p>
            <p className="text-2xl font-semibold">{staff?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-border/80 bg-card/50">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Accounts with name</p>
            <p className="text-2xl font-semibold">
              {(staff ?? []).filter((s) => Boolean(s.full_name)).length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/80 bg-card/50">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Missing names</p>
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
            Invite staff user
          </CardTitle>
          <CardDescription>
            Creates a confirmed user with password sign-in and staff access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleInvite(e)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="st-email">Email</Label>
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
              <Label htmlFor="st-pass">Temporary password</Label>
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
              <Label htmlFor="st-name">Full name (optional)</Label>
              <Input
                id="st-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={inviting}>
              {inviting ? "Creating…" : "Create staff user"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">Staff accounts</CardTitle>
          <CardDescription>Users with the staff role in your project.</CardDescription>
          <div className="pt-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search staff by email, name, or id"
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
                  <TableHead>User ID</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reset password</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStaff.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center">
                      No staff rows yet — promote your first user in SQL or
                      create one above.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStaff.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {s.id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {s.email ?? "—"}
                      </TableCell>
                      <TableCell>{s.full_name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge className="bg-violet-500/15 text-violet-300 hover:bg-violet-500/25">
                          Staff
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {typeof s.is_active !== "boolean" ? (
                          <Badge className="bg-amber-500/15 text-amber-300 hover:bg-amber-500/25">
                            Unknown
                          </Badge>
                        ) : s.is_active ? (
                          <Badge className="bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25">
                            Active
                          </Badge>
                        ) : (
                          <Badge className="bg-rose-500/15 text-rose-300 hover:bg-rose-500/25">
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="min-w-52">
                        <div className="flex items-center gap-2">
                          <Input
                            type="password"
                            placeholder="new password"
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
                            Set
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
                                      "Staff status column is missing. Run the admin hardening migration first."
                                    )
                              }
                              disabled={updatingStaff}
                            >
                              {typeof s.is_active !== "boolean"
                                ? "Status unavailable"
                                : s.is_active
                                  ? "Deactivate"
                                  : "Activate"}
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
