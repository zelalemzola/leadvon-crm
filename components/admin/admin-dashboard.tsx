"use client";

import { useMemo, useState } from "react";
import {
  useGetDashboardStatsQuery,
  useGetCategoriesQuery,
  type AdminDashboardFilters,
  type AdminLeadsAvailability,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { formatQueryError } from "@/lib/utils";

const BAR_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function AdminDashboard() {
  const [daysBack, setDaysBack] = useState(30);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [categoryId, setCategoryId] = useState<string | "all">("all");
  const [country, setCountry] = useState("");
  const [availability, setAvailability] =
    useState<AdminLeadsAvailability>("all");

  const dashboardFilters = useMemo((): AdminDashboardFilters => {
    const hasRange = Boolean(dateFrom && dateTo);
    return {
      daysBack,
      dateFrom: hasRange ? dateFrom : null,
      dateTo: hasRange ? dateTo : null,
      categoryId: categoryId === "all" ? null : categoryId,
      country,
      availability,
    };
  }, [daysBack, dateFrom, dateTo, categoryId, country, availability]);

  const { data: stats, isLoading, isError, error } =
    useGetDashboardStatsQuery(dashboardFilters);
  const { data: categories } = useGetCategoriesQuery();

  const periodLabel = useMemo(() => {
    if (dateFrom && dateTo) return `${dateFrom} → ${dateTo} (UTC)`;
    return `Rolling ${daysBack} days`;
  }, [dateFrom, dateTo, daysBack]);

  const avgCategoriesDenominator = useMemo(() => {
    const rows = stats?.leadsByCategory;
    if (!rows?.length) return 1;
    const withLeads = rows.filter((r) => Number(r.lead_count) > 0).length;
    return Math.max(1, withLeads);
  }, [stats]);

  if (isError) {
    return (
      <div className="space-y-2 p-8">
        <p className="text-destructive">
          Failed to load dashboard: {formatQueryError(error)}
        </p>
        <p className="text-sm text-muted-foreground">
          If you see a database or function error, apply pending Supabase migrations
          (e.g.{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            supabase db push
          </code>
          ) so analytics RPCs match the app.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-8 p-6 lg:p-8">
      <header className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Company performance and lead inventory overview.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border/70 bg-card/40 p-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Date from</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-[150px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Date to</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-[150px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Rolling days (if no range)
            </Label>
            <Select
              value={String(daysBack)}
              onValueChange={(v) => setDaysBack(Number(v))}
              disabled={Boolean(dateFrom && dateTo)}
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Category</Label>
            <Select
              value={categoryId}
              onValueChange={(v) => setCategoryId(v as typeof categoryId)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All" />
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
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Country</Label>
            <Input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Contains…"
              className="w-[150px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Availability</Label>
            <Select
              value={availability}
              onValueChange={(v) => setAvailability(v as AdminLeadsAvailability)}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="sold">Sold</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Lead metrics and charts use the filters above. Active packages and total
          categories are catalog-wide. Period: {periodLabel}.
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
              subtitle={`${stats.categoryCount} categories (catalog-wide)`}
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
                  value={(stats.totalLeads / avgCategoriesDenominator).toFixed(1)}
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
                  New inventory leads per day ({periodLabel}).
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
              <CardTitle className="text-base">Staff activity</CardTitle>
              <CardDescription>
                Admin actions in audit logs. Window length follows your lead
                period (rolling backward from now, capped at 366 days).
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
