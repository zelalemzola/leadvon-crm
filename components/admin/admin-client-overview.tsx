"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useGetClientOverviewQuery } from "@/lib/api/admin-api";
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
import { useI18n } from "@/components/providers/i18n-provider";

export function AdminClientOverview() {
  const { localizePath, t } = useI18n();
  const searchParams = useSearchParams();
  const [organizationId, setOrganizationId] = useState<string>(
    searchParams.get("organization_id") ?? "all"
  );
  const { data, isLoading, isError, error } = useGetClientOverviewQuery(
    organizationId === "all" ? undefined : { organizationId }
  );

  const rows = data ?? [];
  const orgChoices = useMemo(
    () =>
      rows
        .map((r) => ({ id: r.organization_id, name: r.organization_name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [rows]
  );

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.orgs += 1;
        acc.queue += r.pending_queue_leads;
        acc.openInvoices += r.open_invoices_count;
        acc.openInvoiceCents += r.open_invoices_cents;
        acc.activeBudget += r.active_budget_cents;
        acc.delivered += r.delivered_this_month;
        acc.accrued += r.accrued_this_month;
        return acc;
      },
      {
        orgs: 0,
        queue: 0,
        openInvoices: 0,
        openInvoiceCents: 0,
        activeBudget: 0,
        delivered: 0,
        accrued: 0,
      }
    );
  }, [rows]);

  const pacePct = totals.accrued > 0 ? Math.min(100, Math.round((totals.delivered / totals.accrued) * 100)) : 0;

  if (isError) {
    return (
      <div className="p-8">
        <p className="text-destructive">{t("adminOverview.failedToLoad")} {formatQueryError(error)}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("adminOverview.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("adminOverview.subtitle")}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link className="text-xs text-primary hover:underline" href={localizePath("/admin/distribution")}>
            {t("adminOverview.openDistribution")}
          </Link>
          <Link className="text-xs text-primary hover:underline" href={localizePath("/admin/margins")}>
            {t("adminOverview.openMargins")}
          </Link>
          <Link className="text-xs text-primary hover:underline" href={localizePath("/admin/finance")}>
            {t("adminOverview.openFinance")}
          </Link>
        </div>
        <AdminContextPills
          pills={
            organizationId !== "all"
              ? [{ label: t("adminOverview.organization"), value: rows.find((r) => r.organization_id === organizationId)?.organization_name ?? organizationId.slice(0, 8) }]
              : [{ label: t("adminOverview.organization"), value: t("adminOverview.all") }]
          }
        />
      </header>

      <Card className="border-border/80 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">{t("adminOverview.filters")}</CardTitle>
          <CardDescription>{t("adminOverview.filtersDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={organizationId} onValueChange={setOrganizationId}>
            <SelectTrigger className="w-[360px]">
              <SelectValue placeholder={t("adminOverview.selectOrganization")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("adminOverview.allOrganizations")}</SelectItem>
              {orgChoices.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
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
            <Kpi title={t("adminOverview.organizations")} value={String(totals.orgs)} />
            <Kpi title={t("adminOverview.pendingQueueLeads")} value={String(totals.queue)} />
            <Kpi title={t("adminOverview.openInvoices")} value={`${totals.openInvoices} (${money(totals.openInvoiceCents)})`} />
            <Kpi title={t("adminOverview.monthPace")} value={`${totals.delivered} / ${totals.accrued} (${pacePct}%)`} />
          </>
        )}
      </div>

      <Card className="border-border/80 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">{t("adminOverview.clientHealthTable")}</CardTitle>
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
                  <TableHead>{t("adminOverview.organization")}</TableHead>
                  <TableHead>{t("adminOverview.primaryAdmin")}</TableHead>
                  <TableHead>{t("adminOverview.members")}</TableHead>
                  <TableHead>{t("adminOverview.queue")}</TableHead>
                  <TableHead>{t("adminOverview.pace")}</TableHead>
                  <TableHead>{t("adminOverview.activeBudget")}</TableHead>
                  <TableHead>{t("adminOverview.openInvoices")}</TableHead>
                  <TableHead>{t("adminOverview.lastDelivery")}</TableHead>
                  <TableHead className="text-right">{t("adminOverview.drill")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-20 text-center text-muted-foreground">
                      {t("adminOverview.noClients")}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.organization_id}>
                      <TableCell className="font-medium">{r.organization_name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.primary_admin_name ?? t("admin.dashboard.na")}
                        <div className="text-xs">{r.primary_admin_email ?? t("admin.dashboard.na")}</div>
                      </TableCell>
                      <TableCell>
                        {r.members_count}{" "}
                        <span className="text-xs text-muted-foreground">({r.active_members_count} {t("adminOverview.active")})</span>
                      </TableCell>
                      <TableCell className="tabular-nums">{r.pending_queue_leads}</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            r.pace_pct >= 90
                              ? "bg-emerald-500/15 text-emerald-300"
                              : r.pace_pct >= 70
                                ? "bg-amber-500/15 text-amber-300"
                                : "bg-rose-500/15 text-rose-300"
                          }
                        >
                          {r.delivered_this_month} / {r.accrued_this_month} ({r.pace_pct}%)
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">{money(r.active_budget_cents)}</TableCell>
                      <TableCell className="tabular-nums">
                        {r.open_invoices_count} ({money(r.open_invoices_cents)})
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.last_delivery_at ? new Date(r.last_delivery_at).toLocaleString() : t("admin.dashboard.na")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          className="text-xs text-primary hover:underline"
                          href={`${localizePath("/admin/distribution")}?organization_id=${encodeURIComponent(r.organization_id)}`}
                        >
                          {t("adminOverview.distribution")}
                        </Link>
                        <span className="mx-1 text-muted-foreground">|</span>
                        <Link
                          className="text-xs text-primary hover:underline"
                          href={`${localizePath("/admin/margins")}?organization_id=${encodeURIComponent(r.organization_id)}`}
                        >
                          {t("adminOverview.margins")}
                        </Link>
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

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    (cents ?? 0) / 100
  );
}
