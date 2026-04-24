"use client";

import { useState } from "react";
import Link from "next/link";
import { useGetFinanceSnapshotQuery } from "@/lib/api/admin-api";
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
import { Skeleton } from "@/components/ui/skeleton";
import { formatQueryError } from "@/lib/utils";
import { useI18n } from "@/components/providers/i18n-provider";

export function AdminFinanceSnapshot() {
  const { localizePath, t } = useI18n();
  const [months, setMonths] = useState(6);
  const { data, isLoading, isError, error } = useGetFinanceSnapshotQuery({ months });

  if (isError) {
    return (
      <div className="p-8">
        <p className="text-destructive">{t("adminFinance.failedToLoad")} {formatQueryError(error)}</p>
      </div>
    );
  }

  const k = data?.kpis ?? {
    mrr_current_month_cents: 0,
    cash_collected_30d_cents: 0,
    open_ar_cents: 0,
    prepaid_liability_cents: 0,
    recognized_delivery_30d_cents: 0,
  };
  const monthly = data?.monthly ?? [];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("adminFinance.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("adminFinance.subtitle")}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link className="text-xs text-primary hover:underline" href={localizePath("/admin/overview")}>
            {t("adminFinance.openOverview")}
          </Link>
          <Link className="text-xs text-primary hover:underline" href={localizePath("/admin/distribution")}>
            {t("adminFinance.openDistribution")}
          </Link>
          <Link className="text-xs text-primary hover:underline" href={localizePath("/admin/margins")}>
            {t("adminFinance.openMargins")}
          </Link>
        </div>
        <AdminContextPills pills={[{ label: t("adminFinance.window"), value: `${months} ${t("adminFinance.months")}` }]} />
      </header>

      <Card className="border-border/80 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">{t("adminFinance.window")}</CardTitle>
          <CardDescription>{t("adminFinance.windowDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3 {t("adminFinance.months")}</SelectItem>
              <SelectItem value="6">6 {t("adminFinance.months")}</SelectItem>
              <SelectItem value="12">12 {t("adminFinance.months")}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <Kpi title={t("adminFinance.mrrCurrentMonth")} value={money(k.mrr_current_month_cents)} />
            <Kpi title={t("adminFinance.cashCollected30d")} value={money(k.cash_collected_30d_cents)} />
            <Kpi title={t("adminFinance.openAr")} value={money(k.open_ar_cents)} />
            <Kpi title={t("adminFinance.prepaidLiability")} value={money(k.prepaid_liability_cents)} />
            <Kpi title={t("adminFinance.recognizedDelivery30d")} value={money(k.recognized_delivery_30d_cents)} />
          </>
        )}
      </div>

      <Card className="border-border/80 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">{t("adminFinance.monthlyTrend")}</CardTitle>
          <CardDescription>
            {t("adminFinance.monthlyTrendDesc")}
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
                  <TableHead>{t("adminFinance.month")}</TableHead>
                  <TableHead>{t("adminFinance.cashCollected")}</TableHead>
                  <TableHead>{t("adminFinance.recognizedDelivery")}</TableHead>
                  <TableHead>{t("adminFinance.spread")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthly.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                      {t("adminFinance.noData")}
                    </TableCell>
                  </TableRow>
                ) : (
                  monthly.map((m) => {
                    const spread = m.cash_collected_cents - m.recognized_delivery_cents;
                    return (
                      <TableRow key={m.month}>
                        <TableCell className="font-medium">{m.month}</TableCell>
                        <TableCell className="tabular-nums">{money(m.cash_collected_cents)}</TableCell>
                        <TableCell className="tabular-nums">{money(m.recognized_delivery_cents)}</TableCell>
                        <TableCell
                          className={
                            spread >= 0 ? "tabular-nums text-emerald-300" : "tabular-nums text-rose-300"
                          }
                        >
                          {spread >= 0 ? "+" : "-"}
                          {money(Math.abs(spread))}
                        </TableCell>
                      </TableRow>
                    );
                  })
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
