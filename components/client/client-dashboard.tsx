"use client";

import { useMemo, useState } from "react";
import { useGetCategoriesQuery } from "@/lib/api/admin-api";
import {
  useGetCustomerDashboardQuery,
  useGetCustomerLeadCountriesQuery,
  useGetOrgUsersQuery,
  type CustomerDashboardFilters,
} from "@/lib/api/client-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import {
  Flame,
  PhoneOff,
  PhoneCall,
  CheckCircle2,
  XCircle,
  Ban,
  Copy,
  Calendar,
} from "lucide-react";

const statusCards = [
  { key: "new", label: "New", icon: Flame, color: "#f59e0b" },
  { key: "no_answer", label: "No Answer", icon: PhoneOff, color: "#f97316" },
  { key: "call_back", label: "Call Back", icon: PhoneCall, color: "#eab308" },
  { key: "qualified", label: "Qualified", icon: CheckCircle2, color: "#22c55e" },
  { key: "not_interested", label: "Not Interested", icon: XCircle, color: "#f43f5e" },
  { key: "unqualified", label: "Unqualified", icon: Ban, color: "#ef4444" },
  { key: "duplicate", label: "Duplicate", icon: Copy, color: "#8b5cf6" },
] as const;

const datePresetLabels: Record<"7" | "30" | "90" | "all", string> = {
  "7": "Last 7 days",
  "30": "Last 30 days",
  "90": "Last 90 days",
  all: "All time",
};

export function ClientDashboard() {
  const [datePreset, setDatePreset] = useState<"7" | "30" | "90" | "all">("30");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [country, setCountry] = useState<string>("all");
  const [assignedTo, setAssignedTo] = useState<string>("all");

  const { data: categories } = useGetCategoriesQuery();
  const { data: countries } = useGetCustomerLeadCountriesQuery();
  const { data: users } = useGetOrgUsersQuery();

  const dashboardFilters = useMemo((): CustomerDashboardFilters => {
    const base: CustomerDashboardFilters = {
      categoryId,
      country,
      assignedTo,
    };
    if (datePreset === "all") return base;
    const days = Number(datePreset);
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    return {
      ...base,
      dateFrom: from.toISOString().slice(0, 10),
      dateTo: to.toISOString().slice(0, 10),
    };
  }, [datePreset, categoryId, country, assignedTo]);

  const { data, isLoading, isError, error } = useGetCustomerDashboardQuery(dashboardFilters);

  const agentOptions = useMemo(
    () => (users ?? []).filter((u) => u.role.startsWith("customer_") && u.is_active),
    [users]
  );

  if (isError) {
    return (
      <div className="p-8 text-destructive">
        Failed to load dashboard:{" "}
        {error && typeof error === "object" && "data" in error
          ? String((error as { data?: unknown }).data)
          : "Unknown error"}
      </div>
    );
  }

  const filterSelectClass =
    "h-9 w-[min(11rem,calc(100vw-8rem))] shrink-0 border-border bg-background text-left text-sm";

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Lead pipeline overview</p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto lg:flex-nowrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="lg" className="h-9 shrink-0 gap-2 px-3 font-normal">
                <Calendar className="size-4" />
                <span className="max-w-[10rem] truncate sm:max-w-none">
                  {datePresetLabels[datePreset]}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[10rem]">
              <DropdownMenuItem onClick={() => setDatePreset("7")}>
                {datePresetLabels["7"]}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDatePreset("30")}>
                {datePresetLabels["30"]}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDatePreset("90")}>
                {datePresetLabels["90"]}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDatePreset("all")}>
                {datePresetLabels.all}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className={filterSelectClass}>
              <SelectValue placeholder="All Products" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Products</SelectItem>
              {(categories ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger className={filterSelectClass}>
              <SelectValue placeholder="All Countries" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Countries</SelectItem>
              {(countries ?? []).map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={assignedTo} onValueChange={setAssignedTo}>
            <SelectTrigger className={filterSelectClass}>
              <SelectValue placeholder="All Agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {agentOptions.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.full_name || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {isLoading || !data ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <Card className="overflow-hidden border-primary/20 bg-gradient-to-r from-violet-600/70 to-indigo-500/60">
            <CardContent className="space-y-2 p-5">
              <p className="text-xs uppercase tracking-wide text-white/80">Total Leads</p>
              <p className="text-4xl font-bold text-white">{data.totalLeads}</p>
              <div className="flex flex-wrap gap-2">
                {statusCards.slice(0, 6).map((s) => (
                  <Badge key={s.key} variant="secondary" className="bg-white/10 text-white">
                    {s.label}: {data.byStatus[s.key]}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            {statusCards.map(({ key, label, icon: Icon, color }) => (
              <Card key={key} className="border-border/70 bg-card/50">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between">
                    <Icon className="size-4" style={{ color }} />
                    <PercentRing
                      percent={percentageNumber(data.byStatus[key], data.totalLeads)}
                      color={color}
                    />
                  </div>
                  <p className="text-2xl font-semibold tabular-nums">{data.byStatus[key]}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-border/70 bg-card/50">
              <CardHeader>
                <CardTitle className="text-base">Leads flow</CardTitle>
              </CardHeader>
              <CardContent className="h-[280px] pt-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.leadsByDay}>
                    <defs>
                      <linearGradient id="flowFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                      }}
                    />
                    <Area
                      dataKey="count"
                      type="monotone"
                      stroke="var(--primary)"
                      fill="url(#flowFill)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/50">
              <CardHeader>
                <CardTitle className="text-base">Pipeline funnel</CardTitle>
              </CardHeader>
              <CardContent className="h-[280px] pt-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={statusCards
                      .map((s) => ({ name: s.label, count: data.byStatus[s.key] }))
                      .filter((r) => r.count > 0)}
                    layout="vertical"
                    margin={{ left: 10, right: 16 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border/60" />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                      }}
                    />
                    <Bar dataKey="count" radius={[0, 5, 5, 0]} fill="var(--primary)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {(() => {
            const contacted =
              data.byStatus.call_back +
              data.byStatus.qualified +
              data.byStatus.not_interested +
              data.byStatus.unqualified +
              data.byStatus.closed;
            const conversionBase = contacted || 1;
            const conversionRate = ((data.byStatus.qualified + data.byStatus.closed) / conversionBase) * 100;
            const topCategory = data.byCategory[0];
            return (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Card className="border-border/70 bg-card/50">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Contacted Leads</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">{contacted}</p>
                  </CardContent>
                </Card>
                <Card className="border-border/70 bg-card/50">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Qualified + Closed Rate</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">{conversionRate.toFixed(1)}%</p>
                  </CardContent>
                </Card>
                <Card className="border-border/70 bg-card/50">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Open Pipeline</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">
                      {data.byStatus.new + data.byStatus.no_answer + data.byStatus.call_back}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border/70 bg-card/50">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Top Category</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">
                      {topCategory ? topCategory.name : "—"}
                    </p>
                  </CardContent>
                </Card>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

function percentageNumber(a: number, b: number) {
  if (!b) return 0;
  return Math.max(0, Math.min(100, Number(((a / b) * 100).toFixed(0))));
}

function PercentRing({ percent, color }: { percent: number; color: string }) {
  const size = 38;
  const stroke = 3.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="relative inline-flex size-[38px] items-center justify-center rounded-full bg-background/40">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="hsl(var(--border))"
          strokeWidth={stroke}
          opacity={0.6}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-[10px] font-semibold text-foreground">{percent}%</span>
    </div>
  );
}
