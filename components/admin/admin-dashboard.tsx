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
  XAxis,
  YAxis,
  Bar,
  BarChart,
  Cell,
} from "recharts";
import { TrendingUp, Users, Package, Layers } from "lucide-react";
import { formatQueryError } from "@/lib/utils";
import { useI18n } from "@/components/providers/i18n-provider";
import {
  useAdminPagination,
  AdminTablePagination,
} from "@/components/admin/admin-table-pagination";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const BAR_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const leadsFlowConfig = {
  count: {
    label: "Leads",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const categoryBarConfig = {
  count: {
    label: "Leads",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

export function AdminDashboard() {
  const { t } = useI18n();
  const tr = (key: string, vars: Record<string, string>) =>
    Object.entries(vars).reduce(
      (msg, [varKey, varValue]) => msg.replaceAll(`{${varKey}}`, varValue),
      t(key)
    );
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
    return tr("admin.dashboard.rollingDays", { days: String(daysBack) });
  }, [dateFrom, dateTo, daysBack, tr]);

  const avgCategoriesDenominator = useMemo(() => {
    const rows = stats?.leadsByCategory;
    if (!rows?.length) return 1;
    const withLeads = rows.filter((r) => Number(r.lead_count) > 0).length;
    return Math.max(1, withLeads);
  }, [stats]);

  const categoryRows = stats?.leadsByCategory ?? [];
  const staffRows = stats?.staffActivity ?? [];
  const {
    page: categoryPage,
    setPage: setCategoryPage,
    pageCount: categoryPageCount,
    total: categoryTotal,
    pageItems: categoryPageItems,
  } = useAdminPagination(categoryRows);
  const {
    page: activityPage,
    setPage: setActivityPage,
    pageCount: activityPageCount,
    total: activityTotal,
    pageItems: activityPageItems,
  } = useAdminPagination(staffRows);

  if (isError) {
    return (
      <div className="space-y-2 p-8">
        <p className="text-destructive">
          {t("admin.dashboard.failedToLoad")} {formatQueryError(error)}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("admin.dashboard.errorHintBefore")}{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            supabase db push
          </code>
          {t("admin.dashboard.errorHintAfter")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-8 p-6 lg:p-8">
      <header className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("admin.dashboard.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("admin.dashboard.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2 border border-border bg-card p-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("admin.dashboard.dateFrom")}</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-[150px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("admin.dashboard.dateTo")}</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-[150px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("admin.dashboard.rollingDaysLabel")}
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
                <SelectItem value="7">{t("admin.dashboard.days7")}</SelectItem>
                <SelectItem value="30">{t("admin.dashboard.days30")}</SelectItem>
                <SelectItem value="90">{t("admin.dashboard.days90")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("admin.dashboard.category")}</Label>
            <Select
              value={categoryId}
              onValueChange={(v) => setCategoryId(v as typeof categoryId)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t("admin.dashboard.all")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin.dashboard.allCategories")}</SelectItem>
                {(categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("admin.dashboard.country")}</Label>
            <Input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder={t("admin.dashboard.contains")}
              className="w-[150px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("admin.dashboard.availability")}</Label>
            <Select
              value={availability}
              onValueChange={(v) => setAvailability(v as AdminLeadsAvailability)}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin.dashboard.all")}</SelectItem>
                <SelectItem value="available">{t("admin.dashboard.available")}</SelectItem>
                <SelectItem value="sold">{t("admin.dashboard.sold")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {tr("admin.dashboard.filtersHint", { period: periodLabel })}
        </p>
      </header>

      {isLoading || !stats ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-md" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title={t("admin.dashboard.totalLeads")}
              value={stats.totalLeads}
              subtitle={t("admin.dashboard.inInventory")}
              icon={Users}
              highlight
            />
            <MetricCard
              title={t("admin.dashboard.available")}
              value={stats.unsoldLeads}
              subtitle={t("admin.dashboard.notYetSold")}
              icon={Layers}
            />
            <MetricCard
              title={t("admin.dashboard.sold")}
              value={stats.soldLeads}
              subtitle={t("admin.dashboard.markedSold")}
              icon={TrendingUp}
            />
            <MetricCard
              title={t("admin.dashboard.activePackages")}
              value={stats.activePackages}
              subtitle={tr("admin.dashboard.categoriesCatalogWide", {
                count: String(stats.categoryCount),
              })}
              icon={Package}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="border-border bg-card lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("admin.dashboard.performanceSnapshot")}</CardTitle>
                <CardDescription>
                  {t("admin.dashboard.performanceSnapshotDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <SnapshotPill
                  label={t("admin.dashboard.sellThrough")}
                  value={percentage(stats.soldLeads, stats.totalLeads)}
                  tone="rose"
                />
                <SnapshotPill
                  label={t("admin.dashboard.availabilityRate")}
                  value={percentage(stats.unsoldLeads, stats.totalLeads)}
                  tone="emerald"
                />
                <SnapshotPill
                  label={t("admin.dashboard.avgLeadsPerCategory")}
                  value={(stats.totalLeads / avgCategoriesDenominator).toFixed(1)}
                  tone="violet"
                />
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("admin.dashboard.inventoryHealth")}</CardTitle>
                <CardDescription>{t("admin.dashboard.inventoryHealthDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <HealthRow label={t("admin.dashboard.totalInventory")} value={String(stats.totalLeads)} />
                <HealthRow label={t("admin.dashboard.availableNow")} value={String(stats.unsoldLeads)} />
                <HealthRow label={t("admin.dashboard.soldRecords")} value={String(stats.soldLeads)} />
                <HealthRow
                  label={t("admin.dashboard.activePackages")}
                  value={String(stats.activePackages)}
                />
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-base">{t("admin.dashboard.leadsFlow")}</CardTitle>
                <CardDescription>
                  {tr("admin.dashboard.newInventoryPerDay", { period: periodLabel })}
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[280px] pt-0">
                {stats.leadsByDay.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    {t("admin.dashboard.noLeadsInPeriod")}
                  </p>
                ) : (
                  <ChartContainer config={leadsFlowConfig} className="h-full w-full aspect-auto">
                    <AreaChart data={stats.leadsByDay} margin={{ left: 4, right: 8, top: 8 }}>
                      <defs>
                        <linearGradient id="fillLead" x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="0%"
                            stopColor="var(--color-count)"
                            stopOpacity={0.28}
                          />
                          <stop
                            offset="100%"
                            stopColor="var(--color-count)"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="4 4"
                        vertical={false}
                        className="stroke-border/60"
                      />
                      <XAxis
                        dataKey="day"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tick={{ fontSize: 11 }}
                        width={36}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Area
                        type="monotone"
                        dataKey="count"
                        stroke="var(--color-count)"
                        fill="url(#fillLead)"
                        strokeWidth={1.75}
                      />
                    </AreaChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-base">{t("admin.dashboard.byCategory")}</CardTitle>
                <CardDescription>
                  {t("admin.dashboard.byCategoryDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[280px] pt-0">
                {(!categories || categories.length === 0) &&
                stats.leadsByCategory.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    {t("admin.dashboard.createCategoriesHint")}
                  </p>
                ) : (
                  <ChartContainer config={categoryBarConfig} className="h-full w-full aspect-auto">
                    <BarChart
                      data={stats.leadsByCategory.map((r) => ({
                        name: r.category_name,
                        count: Number(r.lead_count),
                      }))}
                      layout="vertical"
                      margin={{ left: 8, right: 16, top: 8 }}
                    >
                      <defs>
                        <pattern
                          id="barHatch"
                          patternUnits="userSpaceOnUse"
                          width="6"
                          height="6"
                          patternTransform="rotate(45)"
                        >
                          <line
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="6"
                            stroke="var(--foreground)"
                            strokeWidth="1.25"
                            strokeOpacity="0.35"
                          />
                        </pattern>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="4 4"
                        horizontal={false}
                        className="stroke-border/60"
                      />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={100}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11 }}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="count" radius={[0, 2, 2, 0]}>
                        {stats.leadsByCategory.map((_, i) => (
                          <Cell
                            key={i}
                            fill={i === 0 ? "url(#barHatch)" : BAR_COLORS[i % BAR_COLORS.length]}
                            fillOpacity={i === 0 ? 1 : 0.85}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base">{t("admin.dashboard.categoryPerformanceTable")}</CardTitle>
              <CardDescription>
                {t("admin.dashboard.categoryPerformanceDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.dashboard.category")}</TableHead>
                    <TableHead>{t("admin.dashboard.totalLeads")}</TableHead>
                    <TableHead>{t("admin.dashboard.available")}</TableHead>
                    <TableHead>{t("admin.dashboard.sold")}</TableHead>
                    <TableHead>{t("admin.dashboard.availability")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.leadsByCategory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-16 text-center">
                        {t("admin.dashboard.noCategoryStats")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    categoryPageItems.map((row) => {
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
            <AdminTablePagination
              page={categoryPage}
              pageCount={categoryPageCount}
              total={categoryTotal}
              onPageChange={setCategoryPage}
            />
          </Card>

            <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base">{t("admin.dashboard.staffActivity")}</CardTitle>
              <CardDescription>
                {t("admin.dashboard.staffActivityDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.dashboard.staff")}</TableHead>
                    <TableHead>{t("admin.dashboard.email")}</TableHead>
                    <TableHead className="text-right">{t("admin.dashboard.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.staffActivity.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="h-16 text-center">
                        {t("admin.dashboard.noActivity")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    activityPageItems.map((row) => (
                      <TableRow key={row.actor_id}>
                        <TableCell className="font-medium">
                          {row.full_name || t("admin.dashboard.unnamedStaff")}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.email ?? t("admin.dashboard.na")}
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
            <AdminTablePagination
              page={activityPage}
              pageCount={activityPageCount}
              total={activityTotal}
              onPageChange={setActivityPage}
            />
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
      ? "bg-rose-500/5 text-rose-300"
      : tone === "emerald"
        ? "bg-emerald-500/5 text-emerald-300"
        : "bg-muted/40 text-foreground";
  return (
    <div className={`border border-border p-3 ${toneClass}`}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function HealthRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border border-border bg-card/40 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string;
  value: number;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}) {
  return (
    <Card className="border-border bg-card">
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
