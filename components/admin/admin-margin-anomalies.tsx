"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useGetCategoriesQuery, useGetCustomersQuery, useGetMarginAnomaliesQuery } from "@/lib/api/admin-api";
import { AdminContextPills } from "@/components/admin/admin-context-pills";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatQueryError } from "@/lib/utils";

export function AdminMarginAnomalies() {
  const searchParams = useSearchParams();
  const [days, setDays] = useState(Number(searchParams.get("days") ?? 30));
  const [organizationId, setOrganizationId] = useState<string>(
    searchParams.get("organization_id") ?? "all"
  );
  const [categoryId, setCategoryId] = useState<string>(
    searchParams.get("category_id") ?? "all"
  );

  const { data: customers } = useGetCustomersQuery();
  const { data: categories } = useGetCategoriesQuery();
  const { data, isLoading, isError, error } = useGetMarginAnomaliesQuery({
    days,
    organizationId: organizationId === "all" ? undefined : organizationId,
    categoryId: categoryId === "all" ? undefined : categoryId,
  });

  const rows = data?.rows ?? [];
  const summary = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.total += 1;
        if (r.severity === "critical") acc.critical += 1;
        else if (r.severity === "warn") acc.warn += 1;
        else acc.ok += 1;
        return acc;
      },
      { total: 0, critical: 0, warn: 0, ok: 0 }
    );
  }, [rows]);

  const orgChoices = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of customers ?? []) m.set(c.organization_id, c.organizations.name);
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [customers]);
  const orgLabel =
    organizationId === "all"
      ? "All"
      : orgChoices.find((o) => o.id === organizationId)?.name ?? organizationId.slice(0, 8);
  const categoryLabel =
    categoryId === "all"
      ? "All"
      : (categories ?? []).find((c) => c.id === categoryId)?.name ?? categoryId.slice(0, 8);

  if (isError) {
    return (
      <div className="p-8">
        <p className="text-destructive">Failed to load margin anomalies: {formatQueryError(error)}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Margin Anomaly Monitor</h1>
        <p className="text-sm text-muted-foreground">
          Compares realized CPL against active pricebook baselines to flag drift.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link
            className="text-xs text-primary hover:underline"
            href={`/admin/distribution?organization_id=${encodeURIComponent(organizationId)}${categoryId !== "all" ? `&category_id=${encodeURIComponent(categoryId)}` : ""}`}
          >
            Open Distribution Console
          </Link>
          <Link
            className="text-xs text-primary hover:underline"
            href={`/admin/overview${organizationId !== "all" ? `?organization_id=${encodeURIComponent(organizationId)}` : ""}`}
          >
            Open Client Overview
          </Link>
          <Link className="text-xs text-primary hover:underline" href="/admin/finance">
            Open Finance Snapshot
          </Link>
        </div>
        <AdminContextPills
          pills={[
            { label: "Window", value: `${days}d` },
            { label: "Organization", value: orgLabel },
            { label: "Category", value: categoryLabel },
          ]}
        />
      </header>

      <Card className="border-border/80 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">Scope</CardTitle>
          <CardDescription>Filter by window, organization, and category.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={organizationId} onValueChange={setOrganizationId}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="All organizations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All organizations</SelectItem>
              {orgChoices.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="All categories" />
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
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <Kpi title="Total monitored buckets" value={String(summary.total)} />
            <Kpi title="Critical" value={String(summary.critical)} tone="critical" />
            <Kpi title="Warning" value={String(summary.warn)} tone="warn" />
            <Kpi title="OK" value={String(summary.ok)} tone="ok" />
          </>
        )}
      </div>

      <Card className="border-border/80 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">Anomaly table</CardTitle>
          <CardDescription>
            Sorted by severity and delta magnitude. Window: last {data?.days ?? days} days.
          </CardDescription>
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
                  <TableHead>Organization</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>Effective CPL</TableHead>
                  <TableHead>Baseline CPL</TableHead>
                  <TableHead>Delta</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-20 text-center text-muted-foreground">
                      No anomalies in current scope.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={`${r.organization_id}-${r.category_id}-${r.unit_type}`}>
                      <TableCell className="font-medium">{r.organization_name}</TableCell>
                      <TableCell>{r.category_name}</TableCell>
                      <TableCell className="capitalize">{r.unit_type}</TableCell>
                      <TableCell className="tabular-nums">{r.leads_count}</TableCell>
                      <TableCell className="tabular-nums">{money(r.effective_cpl_cents)}</TableCell>
                      <TableCell className="tabular-nums">{money(r.baseline_cpl_cents)}</TableCell>
                      <TableCell className="tabular-nums">
                        {r.delta_cents >= 0 ? "+" : "-"}
                        {money(Math.abs(r.delta_cents))} ({r.delta_pct >= 0 ? "+" : ""}
                        {r.delta_pct}%)
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            r.severity === "critical"
                              ? "bg-rose-500/15 text-rose-300"
                              : r.severity === "warn"
                                ? "bg-amber-500/15 text-amber-300"
                                : "bg-emerald-500/15 text-emerald-300"
                          }
                        >
                          {r.severity}
                        </Badge>
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

function Kpi({ title, value, tone = "neutral" }: { title: string; value: string; tone?: "neutral" | "critical" | "warn" | "ok" }) {
  const toneClass =
    tone === "critical"
      ? "border-rose-500/25 bg-rose-500/5"
      : tone === "warn"
        ? "border-amber-500/25 bg-amber-500/5"
        : tone === "ok"
          ? "border-emerald-500/25 bg-emerald-500/5"
          : "border-border/80 bg-card/50";
  return (
    <Card className={toneClass}>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    (cents ?? 0) / 100
  );
}
