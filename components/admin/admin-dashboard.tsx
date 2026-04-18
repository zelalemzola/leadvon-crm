"use client";

import {
  useGetDashboardStatsQuery,
  useGetCategoriesQuery,
} from "@/lib/api/admin-api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart,
  Cell,
} from "recharts";
import { TrendingUp, Users, Package, Layers } from "lucide-react";

const BAR_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function AdminDashboard() {
  const { data: stats, isLoading, isError, error } = useGetDashboardStatsQuery();
  const { data: categories } = useGetCategoriesQuery();

  if (isError) {
    return (
      <div className="p-8">
        <p className="text-destructive">
          Failed to load dashboard:{" "}
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
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Company performance and lead inventory overview.
        </p>
      </header>

      {isLoading || !stats ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total leads"
              value={stats.totalLeads}
              subtitle="In inventory"
              icon={Users}
              highlight
            />
            <MetricCard
              title="Available"
              value={stats.unsoldLeads}
              subtitle="Not yet sold"
              icon={Layers}
            />
            <MetricCard
              title="Sold"
              value={stats.soldLeads}
              subtitle="Marked sold"
              icon={TrendingUp}
            />
            <MetricCard
              title="Active packages"
              value={stats.activePackages}
              subtitle={`${stats.categoryCount} categories`}
              icon={Package}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="border-border/80 bg-card/50 lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Performance snapshot</CardTitle>
                <CardDescription>
                  High-level conversion indicators from inventory state.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <SnapshotPill
                  label="Sell-through"
                  value={percentage(stats.soldLeads, stats.totalLeads)}
                  tone="rose"
                />
                <SnapshotPill
                  label="Availability rate"
                  value={percentage(stats.unsoldLeads, stats.totalLeads)}
                  tone="emerald"
                />
                <SnapshotPill
                  label="Avg leads / category"
                  value={
                    stats.categoryCount > 0
                      ? (stats.totalLeads / stats.categoryCount).toFixed(1)
                      : "0"
                  }
                  tone="violet"
                />
              </CardContent>
            </Card>
            <Card className="border-border/80 bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Inventory health</CardTitle>
                <CardDescription>Quick operational check.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <HealthRow label="Total inventory" value={String(stats.totalLeads)} />
                <HealthRow label="Available now" value={String(stats.unsoldLeads)} />
                <HealthRow label="Sold records" value={String(stats.soldLeads)} />
                <HealthRow
                  label="Active packages"
                  value={String(stats.activePackages)}
                />
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-border/80 bg-card/50">
              <CardHeader>
                <CardTitle className="text-base">Leads flow</CardTitle>
                <CardDescription>
                  New inventory leads per day (last 30 days).
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[280px] pt-0">
                {stats.leadsByDay.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    No leads in this period. Add leads under Leads.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats.leadsByDay}>
                      <defs>
                        <linearGradient id="fillLead" x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="0%"
                            stopColor="var(--primary)"
                            stopOpacity={0.35}
                          />
                          <stop
                            offset="100%"
                            stopColor="var(--primary)"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-border/60"
                      />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        stroke="var(--muted-foreground)"
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        stroke="var(--muted-foreground)"
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="count"
                        stroke="var(--primary)"
                        fill="url(#fillLead)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/80 bg-card/50">
              <CardHeader>
                <CardTitle className="text-base">By category</CardTitle>
                <CardDescription>
                  Lead counts per category (including zero).
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[280px] pt-0">
                {(!categories || categories.length === 0) &&
                stats.leadsByCategory.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    Create categories under Pricing, then add leads.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={stats.leadsByCategory.map((r) => ({
                        name: r.category_name,
                        count: Number(r.lead_count),
                      }))}
                      layout="vertical"
                      margin={{ left: 8, right: 16 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-border/60"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fontSize: 11 }}
                        stroke="var(--muted-foreground)"
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={100}
                        tick={{ fontSize: 11 }}
                        stroke="var(--muted-foreground)"
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {stats.leadsByCategory.map((_, i) => (
                          <Cell
                            key={i}
                            fill={BAR_COLORS[i % BAR_COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/80 bg-card/50">
            <CardHeader>
              <CardTitle className="text-base">Category performance table</CardTitle>
              <CardDescription>
                Detailed breakdown by category, including availability.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Total leads</TableHead>
                    <TableHead>Available</TableHead>
                    <TableHead>Sold</TableHead>
                    <TableHead>Availability</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.leadsByCategory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-16 text-center">
                        No category stats yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    stats.leadsByCategory.map((row) => {
                      const total = Number(row.lead_count);
                      const available = Number(row.unsold_count);
                      const sold = Math.max(total - available, 0);
                      return (
                        <TableRow key={row.category_id}>
                          <TableCell className="font-medium">
                            {row.category_name}
                          </TableCell>
                          <TableCell>{total}</TableCell>
                          <TableCell>
                            <Badge className="bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25">
                              {available}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className="bg-rose-500/15 text-rose-300 hover:bg-rose-500/25">
                              {sold}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {percentage(available, total)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/50">
            <CardHeader>
              <CardTitle className="text-base">Staff activity (14 days)</CardTitle>
              <CardDescription>
                Admin actions captured in audit logs.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.staffActivity.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="h-16 text-center">
                        No activity yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    stats.staffActivity.map((row) => (
                      <TableRow key={row.actor_id}>
                        <TableCell className="font-medium">
                          {row.full_name || "Unnamed staff"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.email ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline">{row.action_count}</Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function percentage(numerator: number, denominator: number) {
  if (!denominator) return "0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function SnapshotPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "rose" | "emerald" | "violet";
}) {
  const toneClass =
    tone === "rose"
      ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
      : tone === "emerald"
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
        : "border-violet-500/40 bg-violet-500/10 text-violet-300";
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function HealthRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  highlight,
}: {
  title: string;
  value: number;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}) {
  return (
    <Card
      className={
        highlight
          ? "border-primary/30 bg-gradient-to-br from-primary/20 via-card to-card"
          : "border-border/80 bg-card/50"
      }
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="size-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tabular-nums">{value}</div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}
