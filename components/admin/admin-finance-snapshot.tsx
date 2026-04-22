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

export function AdminFinanceSnapshot() {
  const [months, setMonths] = useState(6);
  const { data, isLoading, isError, error } = useGetFinanceSnapshotQuery({ months });

  if (isError) {
    return (
      <div className="p-8">
        <p className="text-destructive">Failed to load finance snapshot: {formatQueryError(error)}</p>
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
        <h1 className="text-2xl font-semibold tracking-tight">Finance Snapshot</h1>
        <p className="text-sm text-muted-foreground">
          MRR/cash, AR, prepaid liability, and recognized delivery trends.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link className="text-xs text-primary hover:underline" href="/admin/overview">
            Open Client Overview
          </Link>
          <Link className="text-xs text-primary hover:underline" href="/admin/distribution">
            Open Distribution Console
          </Link>
          <Link className="text-xs text-primary hover:underline" href="/admin/margins">
            Open Margin Monitor
          </Link>
        </div>
        <AdminContextPills pills={[{ label: "Window", value: `${months} months` }]} />
      </header>

      <Card className="border-border/80 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">Window</CardTitle>
          <CardDescription>Controls monthly trend depth.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3 months</SelectItem>
              <SelectItem value="6">6 months</SelectItem>
              <SelectItem value="12">12 months</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <Kpi title="MRR (current month)" value={money(k.mrr_current_month_cents)} />
            <Kpi title="Cash collected (30d)" value={money(k.cash_collected_30d_cents)} />
            <Kpi title="Open A/R" value={money(k.open_ar_cents)} />
            <Kpi title="Prepaid liability" value={money(k.prepaid_liability_cents)} />
            <Kpi title="Recognized delivery (30d)" value={money(k.recognized_delivery_30d_cents)} />
          </>
        )}
      </div>

      <Card className="border-border/80 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">Monthly trend</CardTitle>
          <CardDescription>
            Cash collected (paid invoices) vs recognized delivery amount.
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
                  <TableHead>Month</TableHead>
                  <TableHead>Cash collected</TableHead>
                  <TableHead>Recognized delivery</TableHead>
                  <TableHead>Spread</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthly.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                      No finance data yet.
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
