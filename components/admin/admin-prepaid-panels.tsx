"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  useGetLeadPricebookQuery,
  useUpdateLeadPricebookMutation,
  useGetDeliveryEntitlementsQuery,
} from "@/lib/api/admin-api";
import type { LeadPricebookRow } from "@/types/database";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatQueryError } from "@/lib/utils";

function usd(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function PrepaidPricebookPanel() {
  const { data: rows, isLoading, isError, error } = useGetLeadPricebookQuery();
  const [updateRow, { isLoading: saving }] = useUpdateLeadPricebookMutation();
  const [overrides, setOverrides] = useState<
    Record<string, { priceUsd?: string; label?: string }>
  >({});

  function draft(row: LeadPricebookRow) {
    const o = overrides[row.id];
    return {
      priceUsd: o?.priceUsd ?? (row.price_cents / 100).toFixed(2),
      label: o?.label ?? row.label,
    };
  }

  async function save(row: LeadPricebookRow) {
    const d = draft(row);
    const parsed = Number.parseFloat(d.priceUsd);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Enter a valid USD amount.");
      return;
    }
    const price_cents = Math.round(parsed * 100);
    try {
      await updateRow({
        id: row.id,
        price_cents,
        label: d.label.trim() || row.label,
      }).unwrap();
      setOverrides((m) => {
        const rest = { ...m };
        delete rest[row.id];
        return rest;
      });
      toast.success("Saved");
    } catch (e) {
      toast.error(formatQueryError(e));
    }
  }

  if (isError) {
    return (
      <p className="text-destructive text-sm">
        {formatQueryError(error)}
      </p>
    );
  }

  return (
    <Card className="border-border/80 bg-card/50">
      <CardHeader>
        <CardTitle className="text-base">Lead unit prices (drawdown)</CardTitle>
        <CardDescription>
          Each delivered lead charges this amount (USD) from the customer&apos;s prepaid
          budget for that category. Family rows typically cost more than single.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Unit type</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Price (USD)</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).map((row) => {
                const d = draft(row);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.categories?.name ?? row.category_id.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.unit_type}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <Input
                        value={d.label}
                        onChange={(e) =>
                          setOverrides((m) => ({
                            ...m,
                            [row.id]: { ...m[row.id], label: e.target.value },
                          }))
                        }
                      />
                    </TableCell>
                    <TableCell className="w-[140px]">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-sm">$</span>
                        <Input
                          className="tabular-nums"
                          value={d.priceUsd}
                          onChange={(e) =>
                            setOverrides((m) => ({
                              ...m,
                              [row.id]: { ...m[row.id], priceUsd: e.target.value },
                            }))
                          }
                          inputMode="decimal"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={saving}
                        onClick={() => void save(row)}
                      >
                        Save
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function PrepaidEntitlementsPanel() {
  const { data: rows, isLoading, isError, error } = useGetDeliveryEntitlementsQuery();

  if (isError) {
    return (
      <p className="text-destructive text-sm">{formatQueryError(error)}</p>
    );
  }

  return (
    <Card className="border-border/80 bg-card/50">
      <CardHeader>
        <CardTitle className="text-base">Prepaid delivery periods</CardTitle>
        <CardDescription>
          Rolling <strong>30 calendar days</strong> from{" "}
          <code className="rounded bg-muted px-1 text-xs">period_start</code> (created when
          payment is confirmed — wire your Stripe webhook to{" "}
          <code className="rounded bg-muted px-1 text-xs">
            create_delivery_entitlement
          </code>
          ).
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (rows ?? []).length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No entitlements yet. After Stripe integration, successful payments will create
            rows here.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead>Remaining</TableHead>
                <TableHead>Period (UTC)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Stripe ref</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.organizations?.name ?? r.organization_id.slice(0, 8)}
                  </TableCell>
                  <TableCell className="tabular-nums">{usd(r.budget_cents_total)}</TableCell>
                  <TableCell className="tabular-nums">
                    {usd(r.budget_cents_remaining)}
                  </TableCell>
                  <TableCell className="max-w-[280px] text-xs text-muted-foreground">
                    {new Date(r.period_start).toISOString().slice(0, 10)} →{" "}
                    {new Date(r.period_end).toISOString().slice(0, 10)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.status}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {r.stripe_payment_ref ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
