"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useGetCategoriesQuery, useGetCustomersQuery, useGetDistributionConsoleQuery } from "@/lib/api/admin-api";
import { AdminContextPills } from "@/components/admin/admin-context-pills";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatQueryError } from "@/lib/utils";
import { useI18n } from "@/components/providers/i18n-provider";

export function AdminDistributionConsole() {
  const { t, localizePath } = useI18n();
  const searchParams = useSearchParams();
  const [organizationId, setOrganizationId] = useState<string>(
    searchParams.get("organization_id") ?? "all"
  );
  const [categoryId, setCategoryId] = useState<string>(
    searchParams.get("category_id") ?? "all"
  );
  const { data: customers } = useGetCustomersQuery();
  const { data: categories } = useGetCategoriesQuery();
  const { data, isLoading, isError, error } = useGetDistributionConsoleQuery(
    {
      organizationId: organizationId === "all" ? undefined : organizationId,
      categoryId: categoryId === "all" ? undefined : categoryId,
      limit: 120,
    },
    {
      pollingInterval: 15000,
      refetchOnMountOrArgChange: true,
    }
  );

  const summary = data?.summary ?? {
    active_flows: 0,
    queued_leads: 0,
    accrued_this_month: 0,
    delivered_this_month: 0,
  };
  const events = data?.events ?? [];
  const runs = data?.runs ?? [];

  const pacePct = summary.accrued_this_month
    ? Math.min(100, Math.round((summary.delivered_this_month / summary.accrued_this_month) * 100))
    : 0;

  const orgChoices = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of customers ?? []) {
      m.set(c.organization_id, c.organizations.name);
    }
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [customers]);
  const orgLabel =
    organizationId === "all"
      ? t("adminDistribution.all")
      : orgChoices.find((o) => o.id === organizationId)?.name ?? organizationId.slice(0, 8);
  const categoryLabel =
    categoryId === "all"
      ? t("adminDistribution.all")
      : (categories ?? []).find((c) => c.id === categoryId)?.name ?? categoryId.slice(0, 8);

  if (isError) {
    return (
      <div className="p-8">
        <p className="text-destructive">{t("adminDistribution.failedToLoad")} {formatQueryError(error)}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("adminDistribution.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("adminDistribution.subtitle")}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link
            className="text-xs text-primary hover:underline"
            href={`${localizePath("/admin/overview")}${organizationId !== "all" ? `?organization_id=${encodeURIComponent(organizationId)}` : ""}`}
          >
            {t("adminDistribution.openClientOverview")}
          </Link>
          <Link
            className="text-xs text-primary hover:underline"
            href={`${localizePath("/admin/margins")}?organization_id=${encodeURIComponent(organizationId)}${categoryId !== "all" ? `&category_id=${encodeURIComponent(categoryId)}` : ""}`}
          >
            {t("adminDistribution.openMarginMonitor")}
          </Link>
        </div>
        <AdminContextPills
          pills={[
            { label: t("adminDistribution.organization"), value: orgLabel },
            { label: t("adminDistribution.category"), value: categoryLabel },
            { label: t("adminDistribution.autoRefresh"), value: "15s" },
          ]}
        />
      </header>

      <Card className="border-border/80 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">{t("adminDistribution.scope")}</CardTitle>
          <CardDescription>{t("adminDistribution.scopeDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Select value={organizationId} onValueChange={setOrganizationId}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder={t("adminDistribution.allOrganizations")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("adminDistribution.allOrganizations")}</SelectItem>
              {orgChoices.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder={t("adminDistribution.allCategories")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("adminDistribution.allCategories")}</SelectItem>
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
            <Kpi title={t("adminDistribution.activeFlows")} value={String(summary.active_flows)} />
            <Kpi title={t("adminDistribution.queueBacklog")} value={String(summary.queued_leads)} />
            <Kpi title={t("adminDistribution.deliveredThisMonth")} value={String(summary.delivered_this_month)} />
            <Kpi title={t("adminDistribution.pace")} value={`${summary.delivered_this_month} / ${summary.accrued_this_month} (${pacePct}%)`} />
          </>
        )}
      </div>

      <Card className="border-border/80 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">{t("adminDistribution.recentRoutingEvents")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("adminDistribution.time")}</TableHead>
                <TableHead>{t("adminDistribution.organization")}</TableHead>
                <TableHead>{t("adminDistribution.category")}</TableHead>
                <TableHead>{t("adminDistribution.reason")}</TableHead>
                <TableHead>{t("adminDistribution.deficit")}</TableHead>
                <TableHead>{t("adminDistribution.rank")}</TableHead>
                <TableHead>{t("adminDistribution.leadType")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-20 text-center text-muted-foreground">
                    {t("adminDistribution.noRoutingEvents")}
                  </TableCell>
                </TableRow>
              ) : (
                events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</TableCell>
                    <TableCell>{e.organizations?.name ?? e.organization_id.slice(0, 8)}</TableCell>
                    <TableCell>{e.categories?.name ?? t("admin.dashboard.na")}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          e.routing_reason === "floor_min_share"
                            ? "bg-sky-500/15 text-sky-300"
                            : "bg-violet-500/15 text-violet-300"
                        }
                      >
                        {e.routing_reason}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {e.deficit_before} → {e.deficit_after}
                    </TableCell>
                    <TableCell className="tabular-nums">{e.rank_at_assignment}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">{e.unit_type}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">{t("adminDistribution.recentProcessingRuns")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("adminDistribution.started")}</TableHead>
                <TableHead>{t("adminDistribution.trigger")}</TableHead>
                <TableHead>{t("adminDistribution.status")}</TableHead>
                <TableHead>{t("adminDistribution.delivered")}</TableHead>
                <TableHead>{t("adminDistribution.processedAt")}</TableHead>
                <TableHead>{t("adminDistribution.idempotencyKey")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                    {t("adminDistribution.noRuns")}
                  </TableCell>
                </TableRow>
              ) : (
                runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell>{r.trigger_source}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          r.status === "completed"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : r.status === "running"
                              ? "bg-amber-500/15 text-amber-300"
                              : "bg-rose-500/15 text-rose-300"
                        }
                      >
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{r.delivered_count}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.processed_at ? new Date(r.processed_at).toLocaleString() : t("admin.dashboard.na")}
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate font-mono text-xs text-muted-foreground">
                      {r.idempotency_key}
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

function Kpi({ title, value }: { title: string; value: string }) {
  return (
    <Card className="border-border/80 bg-card/50">
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
