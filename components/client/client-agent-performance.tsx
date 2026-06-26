"use client";

import { useMemo, useState } from "react";
import {
  useGetAgentPerformanceQuery,
  type AgentPerformanceFilters,
} from "@/lib/api/client-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Users, Timer, TrendingUp, PhoneCall } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";
import {
  DateRangeFilter,
  dateFilterToRange,
  type DateFilterValue,
} from "@/components/client/date-range-filter";

function formatDurationLabel(
  duration: { value: number; unit: "minutes" | "hours" | "days" } | null,
  t: (path: string) => string
) {
  if (!duration) return t("clientDashboard.na");
  const unitKey =
    duration.unit === "minutes"
      ? "clientAgentPerformance.minutes"
      : duration.unit === "hours"
        ? "clientAgentPerformance.hours"
        : "clientAgentPerformance.days";
  return `${duration.value} ${t(unitKey)}`;
}

export function ClientAgentPerformance() {
  const { t } = useI18n();
  const [dateFilter, setDateFilter] = useState<DateFilterValue>({ preset: "30" });
  const datePresetLabels: Record<"7" | "30" | "90" | "all", string> = {
    "7": t("clientDashboard.date7"),
    "30": t("clientDashboard.date30"),
    "90": t("clientDashboard.date90"),
    all: t("clientDashboard.dateAll"),
  };

  const filters = useMemo((): AgentPerformanceFilters => {
    const { dateFrom, dateTo } = dateFilterToRange(dateFilter);
    return {
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    };
  }, [dateFilter]);

  const { data, isLoading, isError, error } = useGetAgentPerformanceQuery(filters);

  const chartData = useMemo(
    () =>
      (data?.agents ?? [])
        .filter((agent) => agent.total_assigned > 0)
        .map((agent) => ({
          name: agent.name.split(" ")[0] ?? agent.name,
          assigned: agent.total_assigned,
          contacted: agent.contacted,
          qualified: agent.qualified_closed,
        })),
    [data?.agents]
  );

  const conversionChartData = useMemo(
    () =>
      (data?.agents ?? [])
        .filter((agent) => agent.total_assigned > 0)
        .map((agent) => ({
          name: agent.name.split(" ")[0] ?? agent.name,
          conversion: agent.conversion_rate,
        })),
    [data?.agents]
  );

  if (isError) {
    return (
      <div className="p-8 text-destructive">
        {t("clientAgentPerformance.failed")}{" "}
        {error && typeof error === "object" && "data" in error
          ? String((error as { data?: unknown }).data)
          : t("clientDashboard.unknownError")}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("clientAgentPerformance.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("clientAgentPerformance.subtitle")}</p>
        </div>
        <DateRangeFilter
          value={dateFilter}
          onChange={setDateFilter}
          presetLabels={datePresetLabels}
          customRangeLabel={t("clientDashboard.dateRange")}
        />
      </header>

      {isLoading || !data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="border-border/70 bg-card/50">
              <CardContent className="flex items-center gap-3 p-4">
                <Users className="size-8 text-primary opacity-80" />
                <div>
                  <p className="text-xs text-muted-foreground">{t("clientAgentPerformance.activeAgents")}</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {data.summary.active_agents} / {data.summary.total_agents}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card/50">
              <CardContent className="flex items-center gap-3 p-4">
                <PhoneCall className="size-8 text-primary opacity-80" />
                <div>
                  <p className="text-xs text-muted-foreground">{t("clientAgentPerformance.contactedLeads")}</p>
                  <p className="text-2xl font-semibold tabular-nums">{data.summary.contacted_leads}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card/50">
              <CardContent className="flex items-center gap-3 p-4">
                <Timer className="size-8 text-primary opacity-80" />
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t("clientAgentPerformance.avgTimeToFirstContact")}
                  </p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {formatDurationLabel(data.summary.avg_time_to_first_contact, t)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card/50">
              <CardContent className="flex items-center gap-3 p-4">
                <TrendingUp className="size-8 text-primary opacity-80" />
                <div>
                  <p className="text-xs text-muted-foreground">{t("clientAgentPerformance.topPerformer")}</p>
                  <p className="text-lg font-semibold">
                    {data.leaderboard[0]?.name ?? t("clientDashboard.na")}
                  </p>
                  {data.leaderboard[0] ? (
                    <p className="text-xs text-muted-foreground">
                      {data.leaderboard[0].conversion_rate}% {t("clientAgentPerformance.conversion")}
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-border/70 bg-card/50">
              <CardHeader>
                <CardTitle className="text-base">{t("clientAgentPerformance.pipelineByAgent")}</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px] pt-0">
                {chartData.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {t("clientAgentPerformance.noAgentData")}
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ left: 8, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                      <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                      <Tooltip
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                        }}
                      />
                      <Legend />
                      <Bar dataKey="assigned" name={t("clientAgentPerformance.assigned")} fill="var(--primary)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="contacted" name={t("clientAgentPerformance.contacted")} fill="#22c55e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="qualified" name={t("clientAgentPerformance.qualifiedClosed")} fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/50">
              <CardHeader>
                <CardTitle className="text-base">{t("clientAgentPerformance.conversionByAgent")}</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px] pt-0">
                {conversionChartData.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {t("clientAgentPerformance.noAgentData")}
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={conversionChartData} layout="vertical" margin={{ left: 10, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border/60" />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                      <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                      <Tooltip
                        formatter={(value) => [
                          `${Number(value ?? 0)}%`,
                          t("clientAgentPerformance.conversion"),
                        ]}
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                        }}
                      />
                      <Bar dataKey="conversion" fill="var(--primary)" radius={[0, 5, 5, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/70 bg-card/50">
            <CardHeader>
              <CardTitle className="text-base">{t("clientAgentPerformance.agentTable")}</CardTitle>
              <p className="text-xs text-muted-foreground">{t("clientAgentPerformance.agentTableHint")}</p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("clientAgentPerformance.agent")}</TableHead>
                    <TableHead>{t("clientAgentPerformance.status")}</TableHead>
                    <TableHead className="text-right">{t("clientAgentPerformance.assigned")}</TableHead>
                    <TableHead className="text-right">{t("clientAgentPerformance.contacted")}</TableHead>
                    <TableHead className="text-right">{t("clientAgentPerformance.stillNew")}</TableHead>
                    <TableHead className="text-right">{t("clientAgentPerformance.conversion")}</TableHead>
                    <TableHead className="text-right">{t("clientAgentPerformance.avgCalls")}</TableHead>
                    <TableHead className="text-right">{t("clientAgentPerformance.avgTimeToFirstContact")}</TableHead>
                    <TableHead className="text-right">{t("clientAgentPerformance.assignmentShare")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.agents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-20 text-center text-muted-foreground">
                        {t("clientAgentPerformance.noAgents")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.agents.map((agent) => (
                      <TableRow key={agent.agent_id}>
                        <TableCell>
                          <div className="font-medium">{agent.name}</div>
                          <div className="text-xs text-muted-foreground">{agent.email}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={agent.is_active ? "default" : "secondary"}>
                            {agent.is_active
                              ? t("clientAgentPerformance.active")
                              : t("clientAgentPerformance.inactive")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{agent.total_assigned}</TableCell>
                        <TableCell className="text-right tabular-nums">{agent.contacted}</TableCell>
                        <TableCell className="text-right tabular-nums">{agent.still_new}</TableCell>
                        <TableCell className="text-right tabular-nums">{agent.conversion_rate}%</TableCell>
                        <TableCell className="text-right tabular-nums">{agent.avg_call_count}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatDurationLabel(agent.avg_time_to_first_contact, t)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {agent.assignment_percentage}%
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
