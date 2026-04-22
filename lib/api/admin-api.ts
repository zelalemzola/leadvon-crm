import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import { createClient } from "@/lib/supabase/client";
import type {
  Category,
  CustomerDirectoryRow,
  DeliveryEntitlement,
  Lead,
  LeadOffer,
  LeadPackage,
  LeadPricebookRow,
  LeadWithCategory,
  OfferWithPackage,
  PackageWithCategory,
  Profile,
  SupportContact,
} from "@/types/database";

function sb() {
  return createClient();
}

export type DashboardStats = {
  totalLeads: number;
  unsoldLeads: number;
  soldLeads: number;
  activePackages: number;
  categoryCount: number;
  leadsByDay: { day: string; count: number }[];
  leadsByCategory: {
    category_id: string;
    category_name: string;
    slug: string;
    lead_count: number;
    unsold_count: number;
  }[];
  staffActivity: {
    actor_id: string;
    email: string | null;
    full_name: string | null;
    action_count: number;
  }[];
};

export type ClientOverviewRow = {
  organization_id: string;
  organization_name: string;
  phone: string | null;
  created_at: string;
  primary_admin_name: string | null;
  primary_admin_email: string | null;
  members_count: number;
  admins_count: number;
  agents_count: number;
  active_members_count: number;
  active_flows_count: number;
  pending_queue_leads: number;
  accrued_this_month: number;
  delivered_this_month: number;
  monthly_target_leads: number;
  pace_pct: number;
  active_budget_cents: number;
  open_invoices_count: number;
  open_invoices_cents: number;
  total_spend_cents: number;
  last_delivery_at: string | null;
};

export type DistributionSummary = {
  active_flows: number;
  queued_leads: number;
  accrued_this_month: number;
  delivered_this_month: number;
};

export type DistributionEventRow = {
  id: string;
  process_run_id: string;
  organization_id: string;
  flow_id: string | null;
  source_lead_id: string;
  customer_lead_id: string;
  category_id: string;
  unit_type: "single" | "family";
  routing_reason: string;
  trigger_source: string;
  deficit_before: number;
  deficit_after: number;
  rank_at_assignment: number;
  created_at: string;
  organizations?: { name?: string } | null;
  categories?: { name?: string } | null;
};

export type DistributionRunRow = {
  id: string;
  idempotency_key: string;
  category_id: string | null;
  organization_id: string | null;
  trigger_source: string;
  status: "running" | "completed" | "failed";
  delivered_count: number;
  error_text: string | null;
  created_at: string;
  processed_at: string | null;
};

export type DistributionConsoleData = {
  summary: DistributionSummary;
  events: DistributionEventRow[];
  runs: DistributionRunRow[];
};

export type MarginAnomalyRow = {
  organization_id: string;
  organization_name: string;
  category_id: string;
  category_name: string;
  unit_type: "single" | "family";
  leads_count: number;
  total_cents: number;
  effective_cpl_cents: number;
  baseline_cpl_cents: number;
  delta_cents: number;
  delta_pct: number;
  severity: "ok" | "warn" | "critical";
};

export type MarginAnomaliesData = {
  days: number;
  rows: MarginAnomalyRow[];
};

export type FinanceSnapshotData = {
  months: number;
  kpis: {
    mrr_current_month_cents: number;
    cash_collected_30d_cents: number;
    open_ar_cents: number;
    prepaid_liability_cents: number;
    recognized_delivery_30d_cents: number;
  };
  monthly: Array<{
    month: string;
    cash_collected_cents: number;
    recognized_delivery_cents: number;
  }>;
};

export type AdminLeadsAvailability = "all" | "available" | "sold";
export type AdminLeadsSort = "newest" | "oldest";

export type DeliverPrepaidLeadResult = {
  customer_lead_id: string;
  entitlement_id: string;
  amount_cents: number;
  balance_after_cents: number;
};

export type AdminFlowCommitmentRow = {
  id: string;
  organization_id: string;
  package_id: string;
  leads_per_week: number;
  is_active: boolean;
  pending_delivery_leads: number | null;
  accrued_this_month: number | null;
  delivered_this_month: number | null;
  lead_packages:
    | { id: string; name: string; category_id: string; leads_count: number }
    | { id: string; name: string; category_id: string; leads_count: number }[]
    | null;
  customer_flow_commitments:
    | {
        monthly_target_leads: number;
        business_days_only: boolean;
        shortfall_policy: "carry_forward";
        is_active: boolean;
      }[]
    | null;
};

export type FlowCommitmentsOverview = {
  activeFlows: number;
  queuedLeads: number;
  deliveredThisMonth: number;
  accruedThisMonth: number;
  monthlyTargetLeads: number;
  behindFlows: number;
};

/** Tier 1 admin dashboard: lead analytics scope (catalog counts unchanged). */
export type AdminDashboardFilters = {
  /** Rolling window when dateFrom + dateTo are not both set. Default 30. */
  daysBack?: number;
  dateFrom?: string | null;
  dateTo?: string | null;
  categoryId?: string | null;
  country?: string;
  availability?: AdminLeadsAvailability;
};

const defaultAdminDashboardFilters: Required<
  Pick<
    AdminDashboardFilters,
    "daysBack" | "dateFrom" | "dateTo" | "categoryId" | "country" | "availability"
  >
> = {
  daysBack: 30,
  dateFrom: null,
  dateTo: null,
  categoryId: null,
  country: "",
  availability: "all",
};

function resolveAdminDashboardFilters(
  raw?: AdminDashboardFilters | void
): typeof defaultAdminDashboardFilters {
  return { ...defaultAdminDashboardFilters, ...raw };
}

/** Date / category / country — matches dashboard RPCs (not availability). */
function applyDashboardScopeFilters<
  T extends {
    eq: (c: string, v: string) => T;
    is: (c: string, v: null) => T;
    not: (c: string, o: string, v: null) => T;
    ilike: (c: string, p: string) => T;
    gte: (c: string, v: string) => T;
    lte: (c: string, v: string) => T;
  },
>(base: T, f: typeof defaultAdminDashboardFilters): T {
  let q = base;
  const hasRange = Boolean(f.dateFrom && f.dateTo);
  if (hasRange) {
    q = q
      .gte("created_at", `${f.dateFrom}T00:00:00.000Z`)
      .lte("created_at", `${f.dateTo}T23:59:59.999Z`);
  } else {
    const rollingFrom = new Date(
      Date.now() - f.daysBack * 24 * 60 * 60 * 1000
    ).toISOString();
    q = q.gte("created_at", rollingFrom);
  }
  if (f.categoryId) q = q.eq("category_id", f.categoryId);
  if (f.country.trim()) q = q.ilike("country", `%${f.country.trim()}%`);
  return q;
}

function staffActivityDaysBack(f: typeof defaultAdminDashboardFilters): number {
  if (f.dateFrom && f.dateTo) {
    const a = new Date(`${f.dateFrom}T00:00:00.000Z`).getTime();
    const b = new Date(`${f.dateTo}T23:59:59.999Z`).getTime();
    const spanDays = Math.max(1, Math.ceil((b - a) / 86400000));
    return Math.min(366, spanDays);
  }
  return Math.min(366, f.daysBack);
}

type LeadsQueryParams = {
  categoryId?: string | null;
  search?: string;
  page?: number;
  pageSize?: number;
  availability?: AdminLeadsAvailability;
  /** Partial match on country (case-insensitive). Empty = no filter. */
  country?: string;
  createdFrom?: string | null;
  createdTo?: string | null;
  sort?: AdminLeadsSort;
};

type LeadsPaginated = {
  rows: LeadWithCategory[];
  total: number;
  page: number;
  pageSize: number;
};

async function jsonRequest<T>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown
): Promise<{ data?: T; error?: { status: number; data: string } }> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: T;
    error?: string | { message?: string };
  };
  if (!res.ok) {
    const msg =
      typeof json.error === "string"
        ? json.error
        : json.error?.message ?? "Request failed";
    return { error: { status: res.status, data: msg } };
  }
  return { data: json.data ?? (json as unknown as T) };
}

export const adminApi = createApi({
  reducerPath: "adminApi",
  baseQuery: fakeBaseQuery(),
  tagTypes: [
    "Leads",
    "Categories",
    "Packages",
    "Offers",
    "Staff",
    "Customers",
    "Dashboard",
    "SupportContacts",
    "Pricebook",
    "Entitlements",
    "FlowCommitments",
  ],
  endpoints: (builder) => ({
    getDashboardStats: builder.query<DashboardStats, AdminDashboardFilters | void>({
      queryFn: async (raw) => {
        const f = resolveAdminDashboardFilters(raw);
        const supabase = sb();
        const rpcArgs = {
          p_days_back: f.daysBack,
          p_date_from: f.dateFrom,
          p_date_to: f.dateTo,
          p_filter_category_id: f.categoryId,
          p_country_subtext: f.country.trim() || null,
          p_availability: f.availability,
        };
        const head = () =>
          supabase.from("leads").select("*", { count: "exact", head: true });
        let totalQ = applyDashboardScopeFilters(head(), f);
        if (f.availability === "available") totalQ = totalQ.is("sold_at", null);
        else if (f.availability === "sold") totalQ = totalQ.not("sold_at", "is", null);

        let soldQ = applyDashboardScopeFilters(head(), f).not("sold_at", "is", null);
        if (f.availability === "available") soldQ = soldQ.is("sold_at", null);

        let unsoldQ = applyDashboardScopeFilters(head(), f).is("sold_at", null);
        if (f.availability === "sold") unsoldQ = unsoldQ.not("sold_at", "is", null);

        const [
          byDayRes,
          byCatRes,
          totalCountRow,
          soldRow,
          unsoldRow,
          pkgCountRow,
          catCountRow,
        ] = await Promise.all([
          supabase.rpc("admin_leads_created_by_day", rpcArgs),
          supabase.rpc("admin_leads_by_category", rpcArgs),
          totalQ,
          soldQ,
          unsoldQ,
          supabase
            .from("lead_packages")
            .select("*", { count: "exact", head: true })
            .eq("active", true),
          supabase.from("categories").select("*", { count: "exact", head: true }),
        ]);

        let byDay = byDayRes;
        let byCat = byCatRes;
        // Pre-migration DBs only expose legacy RPC signatures (`days_back`, no args).
        if (byDay.error) {
          const legacy = await supabase.rpc("admin_leads_created_by_day", {
            days_back: f.daysBack,
          });
          if (!legacy.error) byDay = legacy;
        }
        if (byCat.error) {
          const legacy = await supabase.rpc("admin_leads_by_category");
          if (!legacy.error) byCat = legacy;
        }

        if (byDay.error) return { error: byDay.error };
        if (byCat.error) return { error: byCat.error };
        if (totalCountRow.error) return { error: totalCountRow.error };
        if (soldRow.error) return { error: soldRow.error };
        if (unsoldRow.error) return { error: unsoldRow.error };
        if (pkgCountRow.error) return { error: pkgCountRow.error };
        if (catCountRow.error) return { error: catCountRow.error };
        const staffActivityRow = await supabase.rpc("admin_activity_by_staff", {
          days_back: staffActivityDaysBack(f),
        });
        if (staffActivityRow.error) return { error: staffActivityRow.error };

        const sold = soldRow.count ?? 0;
        const unsold = unsoldRow.count ?? 0;
        const total = totalCountRow.count ?? sold + unsold;

        return {
          data: {
            totalLeads: total,
            unsoldLeads: unsold,
            soldLeads: sold,
            activePackages: pkgCountRow.count ?? 0,
            categoryCount: catCountRow.count ?? 0,
            leadsByDay: (byDay.data ?? []).map(
              (r: { day: string; count: number }) => ({
                day: r.day,
                count: Number(r.count),
              })
            ),
            leadsByCategory: (byCat.data ?? []) as DashboardStats["leadsByCategory"],
            staffActivity: ((staffActivityRow.data ?? []) as Array<{
              actor_id: string;
              email: string | null;
              full_name: string | null;
              action_count: number;
            }>).map(
              (r: {
                actor_id: string;
                email: string | null;
                full_name: string | null;
                action_count: number;
              }) => ({
                actor_id: r.actor_id,
                email: r.email,
                full_name: r.full_name,
                action_count: Number(r.action_count),
              })
            ),
          },
        };
      },
      providesTags: ["Dashboard"],
    }),

    getCategories: builder.query<Category[], void>({
      queryFn: async () => {
        const { data, error } = await sb()
          .from("categories")
          .select("*")
          .order("name");
        if (error) return { error };
        return { data: data ?? [] };
      },
      providesTags: ["Categories"],
    }),

    getLeads: builder.query<LeadsPaginated, LeadsQueryParams>({
      queryFn: async ({
        categoryId,
        search = "",
        page = 1,
        pageSize = 25,
        availability = "all",
        country = "",
        createdFrom,
        createdTo,
        sort = "newest",
      }) => {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        const ascending = sort === "oldest";
        const searchOr =
          search.trim() &&
          `first_name.ilike.%${search.trim()}%,last_name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%,summary.ilike.%${search.trim()}%,country.ilike.%${search.trim()}%`;

        const supabase = sb();
        let listQuery = supabase
          .from("leads")
          .select("*, categories(id, name, slug)");
        if (categoryId) listQuery = listQuery.eq("category_id", categoryId);
        if (availability === "available") listQuery = listQuery.is("sold_at", null);
        if (availability === "sold") listQuery = listQuery.not("sold_at", "is", null);
        if (country.trim()) {
          listQuery = listQuery.ilike("country", `%${country.trim()}%`);
        }
        if (createdFrom) {
          listQuery = listQuery.gte("created_at", `${createdFrom}T00:00:00.000Z`);
        }
        if (createdTo) {
          listQuery = listQuery.lte("created_at", `${createdTo}T23:59:59.999Z`);
        }
        if (searchOr) listQuery = listQuery.or(searchOr);
        listQuery = listQuery.order("created_at", { ascending }).range(from, to);

        const { data, error } = await listQuery;
        if (error) return { error };

        let countQuery = supabase.from("leads").select("*", { count: "exact", head: true });
        if (categoryId) countQuery = countQuery.eq("category_id", categoryId);
        if (availability === "available") countQuery = countQuery.is("sold_at", null);
        if (availability === "sold") countQuery = countQuery.not("sold_at", "is", null);
        if (country.trim()) {
          countQuery = countQuery.ilike("country", `%${country.trim()}%`);
        }
        if (createdFrom) {
          countQuery = countQuery.gte("created_at", `${createdFrom}T00:00:00.000Z`);
        }
        if (createdTo) {
          countQuery = countQuery.lte("created_at", `${createdTo}T23:59:59.999Z`);
        }
        if (searchOr) countQuery = countQuery.or(searchOr);
        const countRes = await countQuery;
        if (countRes.error) return { error: countRes.error };
        return {
          data: {
            rows: (data ?? []) as LeadWithCategory[],
            total: countRes.count ?? 0,
            page,
            pageSize,
          },
        };
      },
      providesTags: ["Leads"],
    }),

    getPackages: builder.query<PackageWithCategory[], void>({
      queryFn: async () => {
        const { data, error } = await sb()
          .from("lead_packages")
          .select("*, categories(id, name, slug)")
          .order("created_at", { ascending: false });
        if (error) return { error };
        return { data: (data ?? []) as PackageWithCategory[] };
      },
      providesTags: ["Packages"],
    }),

    getOffers: builder.query<OfferWithPackage[], void>({
      queryFn: async () => {
        const res = await fetch("/api/admin/offers");
        const json = (await res.json().catch(() => ({}))) as {
          data?: OfferWithPackage[];
          error?: string;
        };
        if (!res.ok) {
          return {
            error: { status: res.status, data: json.error ?? "Request failed" },
          };
        }
        return { data: json.data ?? [] };
      },
      providesTags: ["Offers"],
    }),

    getStaff: builder.query<Profile[], void>({
      queryFn: async () => {
        const { data, error } = await sb()
          .from("profiles")
          .select("*")
          .eq("role", "staff")
          .order("created_at", { ascending: false });
        if (error) return { error };
        return { data: (data ?? []) as Profile[] };
      },
      providesTags: ["Staff"],
    }),

    getClientOverview: builder.query<ClientOverviewRow[], { organizationId?: string } | void>({
      queryFn: async (args) => {
        const qp = args?.organizationId
          ? `?organization_id=${encodeURIComponent(args.organizationId)}`
          : "";
        const res = await fetch(`/api/admin/client-overview${qp}`);
        const json = (await res.json().catch(() => ({}))) as {
          data?: ClientOverviewRow[];
          error?: string;
        };
        if (!res.ok) {
          return { error: { status: res.status, data: json.error ?? "Request failed" } };
        }
        return { data: json.data ?? [] };
      },
      providesTags: ["Customers", "FlowCommitments", "Entitlements"],
    }),

    getDistributionConsole: builder.query<
      DistributionConsoleData,
      { organizationId?: string; categoryId?: string; limit?: number } | void
    >({
      queryFn: async (args) => {
        const params = new URLSearchParams();
        if (args?.organizationId) params.set("organization_id", args.organizationId);
        if (args?.categoryId) params.set("category_id", args.categoryId);
        if (args?.limit) params.set("limit", String(args.limit));
        const qs = params.toString();
        const res = await fetch(`/api/admin/distribution${qs ? `?${qs}` : ""}`);
        const json = (await res.json().catch(() => ({}))) as {
          data?: DistributionConsoleData;
          error?: string;
        };
        if (!res.ok) {
          return { error: { status: res.status, data: json.error ?? "Request failed" } };
        }
        return {
          data: json.data ?? {
            summary: {
              active_flows: 0,
              queued_leads: 0,
              accrued_this_month: 0,
              delivered_this_month: 0,
            },
            events: [],
            runs: [],
          },
        };
      },
      providesTags: ["FlowCommitments"],
    }),

    getMarginAnomalies: builder.query<
      MarginAnomaliesData,
      { days?: number; organizationId?: string; categoryId?: string } | void
    >({
      queryFn: async (args) => {
        const params = new URLSearchParams();
        if (args?.days) params.set("days", String(args.days));
        if (args?.organizationId) params.set("organization_id", args.organizationId);
        if (args?.categoryId) params.set("category_id", args.categoryId);
        const qs = params.toString();
        const res = await fetch(`/api/admin/margins${qs ? `?${qs}` : ""}`);
        const json = (await res.json().catch(() => ({}))) as { data?: MarginAnomaliesData; error?: string };
        if (!res.ok) {
          return { error: { status: res.status, data: json.error ?? "Request failed" } };
        }
        return { data: json.data ?? { days: args?.days ?? 30, rows: [] } };
      },
      providesTags: ["Pricebook", "FlowCommitments"],
    }),

    getFinanceSnapshot: builder.query<FinanceSnapshotData, { months?: number } | void>({
      queryFn: async (args) => {
        const params = new URLSearchParams();
        if (args?.months) params.set("months", String(args.months));
        const qs = params.toString();
        const res = await fetch(`/api/admin/finance${qs ? `?${qs}` : ""}`);
        const json = (await res.json().catch(() => ({}))) as { data?: FinanceSnapshotData; error?: string };
        if (!res.ok) {
          return { error: { status: res.status, data: json.error ?? "Request failed" } };
        }
        return {
          data: json.data ?? {
            months: args?.months ?? 6,
            kpis: {
              mrr_current_month_cents: 0,
              cash_collected_30d_cents: 0,
              open_ar_cents: 0,
              prepaid_liability_cents: 0,
              recognized_delivery_30d_cents: 0,
            },
            monthly: [],
          },
        };
      },
      providesTags: ["Entitlements", "FlowCommitments"],
    }),

    getCustomers: builder.query<CustomerDirectoryRow[], void>({
      queryFn: async () => {
        const supabase = sb();
        const { data: organizations, error: orgError } = await supabase
          .from("organizations")
          .select("id, name, phone, created_at")
          .order("created_at", { ascending: false });
        if (orgError) return { error: orgError };

        const { data: profiles, error } = await supabase
          .from("profiles")
          .select("id, organization_id, role, is_active, email, full_name, created_at")
          .in("role", ["customer_admin", "customer_agent"])
          .not("organization_id", "is", null)
          .order("created_at", { ascending: true });
        if (error) return { error };

        const { data: leadRows, error: leadErr } = await supabase
          .from("customer_leads")
          .select("organization_id");
        if (leadErr) return { error: leadErr };

        const countByOrg = new Map<string, number>();
        for (const row of leadRows ?? []) {
          const oid = row.organization_id as string;
          countByOrg.set(oid, (countByOrg.get(oid) ?? 0) + 1);
        }

        const membersByOrg = new Map<
          string,
          Array<{
            id: string;
            role: "customer_admin" | "customer_agent";
            is_active: boolean;
            email: string | null;
            full_name: string | null;
            created_at: string;
          }>
        >();
        for (const p of profiles ?? []) {
          const oid = String(p.organization_id ?? "");
          if (!oid) continue;
          const arr = membersByOrg.get(oid) ?? [];
          arr.push({
            id: String(p.id),
            role: p.role as "customer_admin" | "customer_agent",
            is_active: Boolean(p.is_active),
            email: p.email as string | null,
            full_name: p.full_name as string | null,
            created_at: String(p.created_at),
          });
          membersByOrg.set(oid, arr);
        }

        const rows: CustomerDirectoryRow[] = (organizations ?? []).map((org) => {
          const oid = String(org.id);
          const members = membersByOrg.get(oid) ?? [];
          const admins = members.filter((m) => m.role === "customer_admin");
          const agents = members.filter((m) => m.role === "customer_agent");
          const primaryAdmin = admins[0] ?? null;
          const activeMembersCount = members.filter((m) => m.is_active).length;
          return {
            id: oid,
            organization_id: oid,
            organizations: { id: oid, name: String(org.name) },
            phone: (org.phone as string | null) ?? null,
            created_at: String(org.created_at),
            leadsPurchasedCount: countByOrg.get(oid) ?? 0,
            adminsCount: admins.length,
            agentsCount: agents.length,
            membersCount: members.length,
            activeMembersCount,
            is_active: activeMembersCount > 0,
            primary_admin_id: primaryAdmin?.id ?? null,
            primary_admin_email: primaryAdmin?.email ?? null,
            primary_admin_name: primaryAdmin?.full_name ?? null,
          };
        });

        return { data: rows };
      },
      providesTags: ["Customers"],
    }),

    updateCustomer: builder.mutation<
      Pick<Profile, "id" | "is_active">,
      { id: string; is_active: boolean }
    >({
      queryFn: async ({ id, is_active }) => {
        const { data, error } = await sb()
          .from("profiles")
          .update({ is_active })
          .eq("id", id)
          .in("role", ["customer_admin", "customer_agent"])
          .select("id, is_active")
          .single();
        if (error) return { error };
        return { data: data as Pick<Profile, "id" | "is_active"> };
      },
      invalidatesTags: ["Customers"],
    }),

    getOrganizationFlowCommitments: builder.query<AdminFlowCommitmentRow[], string>({
      queryFn: async (organizationId) => {
        const { data, error } = await sb()
          .from("customer_lead_flows")
          .select(
            "id, organization_id, package_id, leads_per_week, is_active, pending_delivery_leads, accrued_this_month, delivered_this_month, lead_packages(id, name, category_id, leads_count), customer_flow_commitments(monthly_target_leads, business_days_only, shortfall_policy, is_active)"
          )
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false });
        if (error) return { error };
        return { data: ((data ?? []) as unknown as AdminFlowCommitmentRow[]) };
      },
      providesTags: (_result, _error, organizationId) => [
        { type: "FlowCommitments", id: organizationId },
      ],
    }),

    getFlowCommitmentsOverview: builder.query<FlowCommitmentsOverview, void>({
      queryFn: async () => {
        const { data, error } = await sb()
          .from("customer_lead_flows")
          .select(
            "id, is_active, pending_delivery_leads, accrued_this_month, delivered_this_month, customer_flow_commitments(monthly_target_leads)"
          )
          .eq("is_active", true);
        if (error) return { error };

        let queuedLeads = 0;
        let deliveredThisMonth = 0;
        let accruedThisMonth = 0;
        let monthlyTargetLeads = 0;
        let behindFlows = 0;

        for (const row of data ?? []) {
          const pending = Number(row.pending_delivery_leads ?? 0);
          const delivered = Number(row.delivered_this_month ?? 0);
          const accrued = Number(row.accrued_this_month ?? 0);
          const commitment = (row.customer_flow_commitments?.[0] as
            | { monthly_target_leads?: number | null }
            | undefined)?.monthly_target_leads;
          const target = Number(commitment ?? 0);

          queuedLeads += pending;
          deliveredThisMonth += delivered;
          accruedThisMonth += accrued;
          monthlyTargetLeads += target;
          if (accrued > 0 && delivered < accrued) behindFlows += 1;
        }

        return {
          data: {
            activeFlows: (data ?? []).length,
            queuedLeads,
            deliveredThisMonth,
            accruedThisMonth,
            monthlyTargetLeads,
            behindFlows,
          },
        };
      },
      providesTags: ["FlowCommitments"],
    }),

    upsertOrganizationFlowCommitment: builder.mutation<
      AdminFlowCommitmentRow,
      {
        flow_id: string;
        organization_id: string;
        leads_per_week?: number;
        monthly_target_leads: number;
        business_days_only: boolean;
      }
    >({
      queryFn: async ({
        flow_id,
        organization_id,
        leads_per_week,
        monthly_target_leads,
        business_days_only,
      }) => {
        if (leads_per_week !== undefined) {
          const f = await sb()
            .from("customer_lead_flows")
            .update({ leads_per_week })
            .eq("id", flow_id)
            .eq("organization_id", organization_id)
            .select("id")
            .single();
          if (f.error) return { error: f.error };
        }

        const c = await sb().from("customer_flow_commitments").upsert(
          {
            flow_id,
            monthly_target_leads,
            business_days_only,
            is_active: true,
          },
          { onConflict: "flow_id" }
        );
        if (c.error) return { error: c.error };

        const shaped = await sb()
          .from("customer_lead_flows")
          .select(
            "id, organization_id, package_id, leads_per_week, is_active, pending_delivery_leads, accrued_this_month, delivered_this_month, lead_packages(id, name, category_id, leads_count), customer_flow_commitments(monthly_target_leads, business_days_only, shortfall_policy, is_active)"
          )
          .eq("id", flow_id)
          .eq("organization_id", organization_id)
          .single();
        if (shaped.error) return { error: shaped.error };
        return { data: shaped.data as unknown as AdminFlowCommitmentRow };
      },
      invalidatesTags: (_result, _error, args) => [
        { type: "FlowCommitments", id: args.organization_id },
      ],
    }),

    createLead: builder.mutation<
      Lead,
      Pick<
        Lead,
        "category_id" | "lead_unit_type" | "phone" | "first_name" | "last_name" | "country" | "summary"
      > & {
        sold_at?: string | null;
      }
    >({
      queryFn: async (body) => {
        const res = await jsonRequest<LeadWithCategory>("/api/admin/leads", "POST", {
          category_id: body.category_id,
          lead_unit_type: body.lead_unit_type ?? "single",
          phone: body.phone,
          first_name: body.first_name,
          last_name: body.last_name,
          country: body.country,
          summary: body.summary,
          sold_at: body.sold_at ?? null,
        });
        if (res.error) return { error: res.error };
        return { data: res.data as unknown as Lead };
      },
      invalidatesTags: ["Leads", "Dashboard"],
    }),

    updateLead: builder.mutation<
      Lead,
      Partial<Lead> & { id: string }
    >({
      queryFn: async ({ id, ...patch }) => {
        const res = await jsonRequest<LeadWithCategory>("/api/admin/leads", "PATCH", {
          id,
          ...patch,
        });
        if (res.error) return { error: res.error };
        return { data: res.data as unknown as Lead };
      },
      invalidatesTags: ["Leads", "Dashboard"],
    }),

    deleteLead: builder.mutation<void, string>({
      queryFn: async (id) => {
        const res = await jsonRequest<{ ok: true }>(
          `/api/admin/leads?id=${id}`,
          "DELETE"
        );
        if (res.error) return { error: res.error };
        return { data: undefined };
      },
      invalidatesTags: ["Leads", "Dashboard"],
    }),

    createCategory: builder.mutation<
      Category,
      Pick<Category, "name" | "slug">
    >({
      queryFn: async (body) => {
        const res = await jsonRequest<Category>("/api/admin/categories", "POST", body);
        if (res.error) return { error: res.error };
        return { data: res.data as Category };
      },
      invalidatesTags: ["Categories", "Dashboard"],
    }),

    updateCategory: builder.mutation<
      Category,
      Partial<Category> & { id: string }
    >({
      queryFn: async ({ id, ...patch }) => {
        const res = await jsonRequest<Category>("/api/admin/categories", "PATCH", {
          id,
          ...patch,
        });
        if (res.error) return { error: res.error };
        return { data: res.data as Category };
      },
      invalidatesTags: ["Categories", "Dashboard"],
    }),

    deleteCategory: builder.mutation<void, string>({
      queryFn: async (id) => {
        const res = await jsonRequest<{ ok: true }>(
          `/api/admin/categories?id=${id}`,
          "DELETE"
        );
        if (res.error) return { error: res.error };
        return { data: undefined };
      },
      invalidatesTags: ["Categories", "Dashboard"],
    }),

    createPackage: builder.mutation<
      LeadPackage,
      Omit<
        LeadPackage,
        "id" | "created_at" | "updated_at" | "stripe_price_id"
      > & { stripe_price_id?: string | null }
    >({
      queryFn: async (body) => {
        const res = await jsonRequest<LeadPackage>("/api/admin/packages", "POST", body);
        if (res.error) return { error: res.error };
        return { data: res.data as LeadPackage };
      },
      invalidatesTags: ["Packages", "Dashboard"],
    }),

    updatePackage: builder.mutation<
      LeadPackage,
      Partial<LeadPackage> & { id: string }
    >({
      queryFn: async ({ id, ...patch }) => {
        const res = await jsonRequest<LeadPackage>("/api/admin/packages", "PATCH", {
          id,
          ...patch,
        });
        if (res.error) return { error: res.error };
        return { data: res.data as LeadPackage };
      },
      invalidatesTags: ["Packages", "Dashboard"],
    }),

    deletePackage: builder.mutation<void, string>({
      queryFn: async (id) => {
        const res = await jsonRequest<{ ok: true }>(
          `/api/admin/packages?id=${id}`,
          "DELETE"
        );
        if (res.error) return { error: res.error };
        return { data: undefined };
      },
      invalidatesTags: ["Packages", "Dashboard"],
    }),

    createOffer: builder.mutation<LeadOffer, Omit<LeadOffer, "id" | "created_at" | "updated_at">>({
      queryFn: async (body) => {
        const res = await jsonRequest<LeadOffer>("/api/admin/offers", "POST", body);
        if (res.error) return { error: res.error };
        return { data: res.data as LeadOffer };
      },
      invalidatesTags: ["Offers"],
    }),

    updateOffer: builder.mutation<LeadOffer, Partial<LeadOffer> & { id: string }>({
      queryFn: async ({ id, ...patch }) => {
        const res = await jsonRequest<LeadOffer>("/api/admin/offers", "PATCH", {
          id,
          ...patch,
        });
        if (res.error) return { error: res.error };
        return { data: res.data as LeadOffer };
      },
      invalidatesTags: ["Offers"],
    }),

    deleteOffer: builder.mutation<void, string>({
      queryFn: async (id) => {
        const res = await jsonRequest<{ ok: true }>(
          `/api/admin/offers?id=${id}`,
          "DELETE"
        );
        if (res.error) return { error: res.error };
        return { data: undefined };
      },
      invalidatesTags: ["Offers"],
    }),

    inviteStaff: builder.mutation<
      { ok: true },
      { email: string; password: string; full_name?: string }
    >({
      queryFn: async (body) => {
        const res = await fetch("/api/admin/staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!res.ok) {
          return {
            error: {
              status: res.status,
              data: json.error ?? "Request failed",
            },
          };
        }
        return { data: { ok: true as const } };
      },
      invalidatesTags: ["Staff"],
    }),

    updateStaff: builder.mutation<
      { ok: true },
      {
        id: string;
        role?: Profile["role"];
        is_active?: boolean;
        password?: string;
      }
    >({
      queryFn: async ({ id, ...body }) => {
        const res = await jsonRequest<{ ok: true }>(
          `/api/admin/staff/${id}`,
          "PATCH",
          body
        );
        if (res.error) return { error: res.error };
        return { data: { ok: true } };
      },
      invalidatesTags: ["Staff"],
    }),

    getSupportContacts: builder.query<SupportContact[], void>({
      queryFn: async () => {
        const res = await fetch("/api/admin/support-contacts");
        const json = (await res.json().catch(() => ({}))) as {
          data?: SupportContact[];
          error?: string;
        };
        if (!res.ok) {
          return { error: { status: res.status, data: json.error ?? "Request failed" } };
        }
        return { data: json.data ?? [] };
      },
      providesTags: ["SupportContacts"],
    }),

    createSupportContact: builder.mutation<
      SupportContact,
      Pick<SupportContact, "title" | "description" | "sort_order"> & {
        email?: string | null;
        phone?: string | null;
        organization_id?: string | null;
      }
    >({
      queryFn: async (body) => {
        const res = await jsonRequest<SupportContact>("/api/admin/support-contacts", "POST", body);
        if (res.error) return { error: res.error };
        return { data: res.data as SupportContact };
      },
      invalidatesTags: ["SupportContacts"],
    }),

    updateSupportContact: builder.mutation<
      SupportContact,
      Partial<SupportContact> & { id: string }
    >({
      queryFn: async ({ id, ...patch }) => {
        const res = await jsonRequest<SupportContact>(
          `/api/admin/support-contacts/${id}`,
          "PATCH",
          patch
        );
        if (res.error) return { error: res.error };
        return { data: res.data as SupportContact };
      },
      invalidatesTags: ["SupportContacts"],
    }),

    deleteSupportContact: builder.mutation<void, string>({
      queryFn: async (id) => {
        const res = await jsonRequest<{ ok: true }>(
          `/api/admin/support-contacts/${id}`,
          "DELETE"
        );
        if (res.error) return { error: res.error };
        return { data: undefined };
      },
      invalidatesTags: ["SupportContacts"],
    }),

    getLeadPricebook: builder.query<LeadPricebookRow[], void>({
      queryFn: async () => {
        const { data, error } = await sb()
          .from("lead_pricebook")
          .select("*, categories(id, name, slug)")
          .order("category_id");
        if (error) return { error };
        return { data: (data ?? []) as LeadPricebookRow[] };
      },
      providesTags: ["Pricebook"],
    }),

    updateLeadPricebook: builder.mutation<
      LeadPricebookRow,
      { id: string; price_cents?: number; label?: string; active?: boolean }
    >({
      queryFn: async ({ id, ...patch }) => {
        const { data, error } = await sb()
          .from("lead_pricebook")
          .update(patch)
          .eq("id", id)
          .select("*, categories(id, name, slug)")
          .single();
        if (error) return { error };
        return { data: data as LeadPricebookRow };
      },
      invalidatesTags: ["Pricebook"],
    }),

    getDeliveryEntitlements: builder.query<DeliveryEntitlement[], void>({
      queryFn: async () => {
        const { data, error } = await sb()
          .from("delivery_entitlements")
          .select("*, organizations(id, name)")
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) return { error };
        return { data: (data ?? []) as DeliveryEntitlement[] };
      },
      providesTags: ["Entitlements"],
    }),

    deliverPrepaidLead: builder.mutation<
      DeliverPrepaidLeadResult,
      { organization_id: string; source_lead_id: string }
    >({
      queryFn: async (body) => {
        const res = await jsonRequest<DeliverPrepaidLeadResult>(
          "/api/admin/leads/deliver-prepaid",
          "POST",
          body
        );
        if (res.error) return { error: res.error };
        return { data: res.data as DeliverPrepaidLeadResult };
      },
      invalidatesTags: ["Leads", "Dashboard", "Entitlements", "Customers"],
    }),
  }),
});

export const {
  useGetDashboardStatsQuery,
  useGetCategoriesQuery,
  useGetLeadsQuery,
  useGetPackagesQuery,
  useGetStaffQuery,
  useGetCustomersQuery,
  useUpdateCustomerMutation,
  useGetOrganizationFlowCommitmentsQuery,
  useGetFlowCommitmentsOverviewQuery,
  useUpsertOrganizationFlowCommitmentMutation,
  useCreateLeadMutation,
  useUpdateLeadMutation,
  useDeleteLeadMutation,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
  useCreatePackageMutation,
  useUpdatePackageMutation,
  useDeletePackageMutation,
  useGetOffersQuery,
  useCreateOfferMutation,
  useUpdateOfferMutation,
  useDeleteOfferMutation,
  useInviteStaffMutation,
  useUpdateStaffMutation,
  useGetSupportContactsQuery,
  useGetClientOverviewQuery,
  useGetDistributionConsoleQuery,
  useGetMarginAnomaliesQuery,
  useGetFinanceSnapshotQuery,
  useCreateSupportContactMutation,
  useUpdateSupportContactMutation,
  useDeleteSupportContactMutation,
  useGetLeadPricebookQuery,
  useUpdateLeadPricebookMutation,
  useGetDeliveryEntitlementsQuery,
  useDeliverPrepaidLeadMutation,
} = adminApi;
