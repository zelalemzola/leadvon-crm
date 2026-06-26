import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireCustomerUser } from "@/lib/server/client/auth";

type CustomerLeadStatus =
  | "new"
  | "no_answer"
  | "call_back"
  | "qualified"
  | "not_interested"
  | "unqualified"
  | "duplicate"
  | "closed";

const STATUSES: CustomerLeadStatus[] = [
  "new",
  "no_answer",
  "call_back",
  "qualified",
  "not_interested",
  "unqualified",
  "duplicate",
  "closed",
];

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return sorted[mid]!;
}

function formatDuration(ms: number | null) {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return null;
  const totalMinutes = Math.round(ms / 60_000);
  if (totalMinutes < 60) return { value: totalMinutes, unit: "minutes" as const };
  const totalHours = Math.round(totalMinutes / 60);
  if (totalHours < 48) return { value: totalHours, unit: "hours" as const };
  const totalDays = Math.round(totalHours / 24);
  return { value: totalDays, unit: "days" as const };
}

export async function GET(request: Request) {
  const auth = await requireCustomerUser({ adminOnly: true });
  if ("error" in auth) {
    return auth.error;
  }

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");

  const service = createServiceClient();

  const { data: agents, error: agentsError } = await service
    .from("profiles")
    .select("id, email, full_name, role, is_active, lead_assignment_percentage")
    .eq("organization_id", auth.organizationId)
    .in("role", ["customer_agent", "customer_admin"])
    .order("full_name", { ascending: true });

  if (agentsError) {
    return NextResponse.json({ error: agentsError.message }, { status: 400 });
  }

  let leadsQuery = service
    .from("customer_leads")
    .select(
      "id, status, assigned_to, created_at, first_contacted_at, call_count, status_updated_at"
    )
    .eq("organization_id", auth.organizationId);

  if (dateFrom) leadsQuery = leadsQuery.gte("created_at", dateFrom);
  if (dateTo) leadsQuery = leadsQuery.lte("created_at", `${dateTo}T23:59:59.999Z`);

  const { data: leads, error: leadsError } = await leadsQuery;
  if (leadsError) {
    return NextResponse.json({ error: leadsError.message }, { status: 400 });
  }

  const rows = leads ?? [];
  const agentRows = (agents ?? []).filter((a) => a.role === "customer_agent");

  const agentStats = agentRows.map((agent) => {
    const assigned = rows.filter((lead) => lead.assigned_to === agent.id);
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<
      CustomerLeadStatus,
      number
    >;
    for (const lead of assigned) {
      const status = String(lead.status) as CustomerLeadStatus;
      if (status in byStatus) byStatus[status] += 1;
    }

    const contacted = assigned.filter((lead) => lead.status !== "new").length;
    const qualifiedClosed = byStatus.qualified + byStatus.closed;
    const conversionRate =
      contacted > 0 ? Number(((qualifiedClosed / contacted) * 100).toFixed(1)) : 0;

    const ttfcMs = assigned
      .filter((lead) => lead.first_contacted_at)
      .map((lead) => {
        const start = new Date(lead.created_at as string).getTime();
        const end = new Date(lead.first_contacted_at as string).getTime();
        return end - start;
      })
      .filter((ms) => Number.isFinite(ms) && ms >= 0);

    const avgTimeToFirstContactMs =
      ttfcMs.length > 0
        ? Math.round(ttfcMs.reduce((sum, ms) => sum + ms, 0) / ttfcMs.length)
        : null;
    const medianTimeToFirstContactMs = median(ttfcMs);

    const callCounts = assigned
      .map((lead) => Number(lead.call_count ?? 0))
      .filter((n) => Number.isFinite(n));
    const avgCallCount =
      callCounts.length > 0
        ? Number((callCounts.reduce((sum, n) => sum + n, 0) / callCounts.length).toFixed(1))
        : 0;

    return {
      agent_id: agent.id,
      name: agent.full_name?.trim() || agent.email || "Agent",
      email: agent.email,
      is_active: Boolean(agent.is_active),
      assignment_percentage: Number(agent.lead_assignment_percentage ?? 0),
      total_assigned: assigned.length,
      contacted,
      still_new: byStatus.new,
      qualified_closed: qualifiedClosed,
      conversion_rate: conversionRate,
      avg_call_count: avgCallCount,
      by_status: byStatus,
      avg_time_to_first_contact_ms: avgTimeToFirstContactMs,
      median_time_to_first_contact_ms: medianTimeToFirstContactMs,
      avg_time_to_first_contact: formatDuration(avgTimeToFirstContactMs),
      median_time_to_first_contact: formatDuration(medianTimeToFirstContactMs),
    };
  });

  agentStats.sort((a, b) => b.total_assigned - a.total_assigned);

  const orgTtfcMs = rows
    .filter((lead) => lead.first_contacted_at)
    .map((lead) => {
      const start = new Date(lead.created_at as string).getTime();
      const end = new Date(lead.first_contacted_at as string).getTime();
      return end - start;
    })
    .filter((ms) => Number.isFinite(ms) && ms >= 0);

  const orgAvgTtfc =
    orgTtfcMs.length > 0
      ? Math.round(orgTtfcMs.reduce((sum, ms) => sum + ms, 0) / orgTtfcMs.length)
      : null;

  const leaderboard = [...agentStats]
    .filter((a) => a.total_assigned > 0)
    .sort((a, b) => b.conversion_rate - a.conversion_rate)
    .slice(0, 5)
    .map((a) => ({
      agent_id: a.agent_id,
      name: a.name,
      conversion_rate: a.conversion_rate,
      total_assigned: a.total_assigned,
    }));

  const statusTotals = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<
    CustomerLeadStatus,
    number
  >;
  for (const lead of rows) {
    const status = String(lead.status) as CustomerLeadStatus;
    if (status in statusTotals) statusTotals[status] += 1;
  }

  return NextResponse.json({
    data: {
      summary: {
        total_leads: rows.length,
        total_agents: agentRows.length,
        active_agents: agentRows.filter((a) => a.is_active).length,
        avg_time_to_first_contact_ms: orgAvgTtfc,
        avg_time_to_first_contact: formatDuration(orgAvgTtfc),
        contacted_leads: rows.filter((lead) => lead.status !== "new").length,
        by_status: statusTotals,
      },
      agents: agentStats,
      leaderboard,
    },
  });
}
