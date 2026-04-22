"use client";

import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import { createClient } from "@/lib/supabase/client";
import type {
  Category,
  CustomerAuditLog,
  DeliveryEntitlement,
  DeliveryLedgerLine,
  LeadUnitType,
  OfferWithPackage,
  PackageWithCategory,
  Profile,
  SupportContact,
} from "@/types/database";

type CustomerLeadStatus =
  | "new"
  | "no_answer"
  | "call_back"
  | "qualified"
  | "not_interested"
  | "unqualified"
  | "duplicate"
  | "closed";

export type CustomerLeadSort =
  | "newest_added"
  | "oldest_added"
  | "recently_updated"
  | "oldest_updated";

export type CustomerLead = {
  id: string;
  organization_id: string;
  source_lead_id: string;
  category_id: string;
  purchase_id: string | null;
  phone: string;
  first_name: string;
  last_name: string;
  country: string;
  summary: string;
  notes: string;
  status: CustomerLeadStatus;
  assigned_to: string | null;
  status_updated_at: string;
  created_at: string;
  updated_at: string;
  lead_unit_type?: LeadUnitType;
  charged_amount_cents?: number | null;
  entitlement_id?: string | null;
  categories: Pick<Category, "id" | "name" | "slug"> | null;
  assignee: Pick<Profile, "id" | "email" | "full_name"> | null;
};

export type CustomerDashboardStats = {
  totalLeads: number;
  byStatus: Record<CustomerLeadStatus, number>;
  leadsByDay: { day: string; count: number }[];
  byCategory: { name: string; count: number }[];
};

export type CustomerDashboardFilters = {
  dateFrom?: string | null;
  dateTo?: string | null;
  categoryId?: string | "all";
  country?: string | "all";
  assignedTo?: string | "all";
};

export type WalletData = {
  id: string;
  organization_id: string;
  balance_cents: number;
  currency: string;
};

export type WalletTransaction = {
  id: string;
  tx_type: "credit" | "debit";
  amount_cents: number;
  reference_type: string;
  reference_id: string | null;
  description: string;
  created_at: string;
};

export type DeliveryInvoice = {
  id: string;
  organization_id: string;
  invoice_type: "prepaid_purchase" | "month_end_usage";
  status: "open" | "paid" | "void";
  currency: string;
  period_start: string;
  period_end: string;
  subtotal_cents: number;
  total_cents: number;
  stripe_payment_ref: string | null;
  notes: string;
  created_at: string;
};

export type ClientCatalogPackage = PackageWithCategory & {
  available_unsold_leads: number;
};

export type ClientMe = Pick<
  Profile,
  "id" | "role" | "is_active" | "organization_id" | "email" | "full_name" | "phone"
>;
export type OrgUserWithLastLogin = Profile & { last_sign_in_at: string | null };
export type CustomerLeadFlow = {
  id: string;
  package_id: string;
  leads_per_week: number;
  is_active: boolean;
  next_run_at: string;
  last_run_at: string | null;
  /** Leads queued for delivery (daily accrual + catch-up). */
  pending_delivery_leads?: number;
  last_obligation_date?: string | null;
  accrued_this_month?: number;
  delivered_this_month?: number;
  customer_flow_commitments?:
    | {
        monthly_target_leads: number;
        business_days_only: boolean;
        shortfall_policy: "carry_forward";
        is_active: boolean;
      }[]
    | null;
  created_at: string;
  updated_at: string;
  lead_packages: { id: string; name: string; leads_count: number; category_id: string } | null;
};

function sb() {
  return createClient();
}

async function requestJson<T>(
  url: string,
  method: "POST" | "PATCH",
  body?: unknown
): Promise<{ data?: T; error?: { status: number; data: string } }> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!res.ok) {
    return {
      error: {
        status: res.status,
        data: json.error ?? "Request failed",
      },
    };
  }
  return { data: (json.data ?? (json as T)) as T };
}

export const clientApi = createApi({
  reducerPath: "clientApi",
  baseQuery: fakeBaseQuery(),
  tagTypes: [
    "ClientLeads",
    "ClientDashboard",
    "Wallet",
    "ClientUsers",
    "Packages",
    "LeadFlows",
    "ClientAudit",
    "SupportContacts",
    "ClientEntitlements",
    "ClientDeliveryLedger",
    "ClientInvoices",
  ],
  endpoints: (builder) => ({
    getClientMe: builder.query<ClientMe | null, void>({
      queryFn: async () => {
        const {
          data: { user },
          error: authError,
        } = await sb().auth.getUser();
        if (authError) return { error: authError };
        if (!user) return { data: null };
        const primary = await sb()
          .from("profiles")
          .select("id, role, is_active, organization_id, email, full_name, phone")
          .eq("id", user.id)
          .maybeSingle();
        if (primary.error && primary.error.message.includes("phone")) {
          const fallback = await sb()
            .from("profiles")
            .select("id, role, is_active, organization_id, email, full_name")
            .eq("id", user.id)
            .maybeSingle();
          if (fallback.error) return { error: fallback.error };
          return {
            data: ((fallback.data
              ? { ...fallback.data, phone: null }
              : null) as ClientMe | null) ?? null,
          };
        }
        if (primary.error) return { error: primary.error };
        return { data: (primary.data as ClientMe | null) ?? null };
      },
    }),

    getCustomerLeads: builder.query<
      { rows: CustomerLead[]; total: number },
      {
        search?: string;
        categoryId?: string;
        country?: string | "all";
        unitType?: LeadUnitType | "all";
        status?: CustomerLeadStatus | "all";
        assignedTo?: string | "all";
        sort?: CustomerLeadSort;
        page?: number;
        pageSize?: number;
      }
    >({
      queryFn: async ({
        search = "",
        categoryId,
        country = "all",
        unitType = "all",
        status = "all",
        assignedTo = "all",
        sort = "newest_added",
        page = 1,
        pageSize = 20,
      }) => {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let q = sb()
          .from("customer_leads")
          .select("*, categories(id, name, slug), assignee:profiles!customer_leads_assigned_to_fkey(id, email, full_name)")
          .range(from, to);
        if (sort === "oldest_added") {
          q = q.order("created_at", { ascending: true });
        } else if (sort === "recently_updated") {
          q = q.order("updated_at", { ascending: false });
        } else if (sort === "oldest_updated") {
          q = q.order("updated_at", { ascending: true });
        } else {
          q = q.order("created_at", { ascending: false });
        }
        if (categoryId) q = q.eq("category_id", categoryId);
        if (country !== "all") q = q.eq("country", country);
        if (unitType !== "all") q = q.eq("lead_unit_type", unitType);
        if (status !== "all") q = q.eq("status", status);
        if (assignedTo !== "all") q = q.eq("assigned_to", assignedTo);
        if (search.trim()) {
          const term = search.trim();
          q = q.or(
            `first_name.ilike.%${term}%,last_name.ilike.%${term}%,phone.ilike.%${term}%,summary.ilike.%${term}%,notes.ilike.%${term}%`
          );
        }
        const { data, error } = await q;
        if (error) return { error };

        let cq = sb().from("customer_leads").select("*", { head: true, count: "exact" });
        if (categoryId) cq = cq.eq("category_id", categoryId);
        if (country !== "all") cq = cq.eq("country", country);
        if (unitType !== "all") cq = cq.eq("lead_unit_type", unitType);
        if (status !== "all") cq = cq.eq("status", status);
        if (assignedTo !== "all") cq = cq.eq("assigned_to", assignedTo);
        if (search.trim()) {
          const term = search.trim();
          cq = cq.or(
            `first_name.ilike.%${term}%,last_name.ilike.%${term}%,phone.ilike.%${term}%,summary.ilike.%${term}%,notes.ilike.%${term}%`
          );
        }
        const c = await cq;
        if (c.error) return { error: c.error };

        return {
          data: { rows: (data ?? []) as CustomerLead[], total: c.count ?? 0 },
        };
      },
      providesTags: ["ClientLeads"],
    }),

    updateCustomerLead: builder.mutation<
      CustomerLead,
      { id: string; status?: CustomerLeadStatus; notes?: string; assigned_to?: string | null }
    >({
      queryFn: async ({ id, ...patch }) => {
        const res = await requestJson<CustomerLead>(`/api/client/leads/${id}`, "PATCH", patch);
        if (res.error) return { error: res.error };
        return { data: res.data! };
      },
      invalidatesTags: ["ClientLeads", "ClientDashboard", "ClientAudit"],
    }),

    getCustomerDashboard: builder.query<CustomerDashboardStats, CustomerDashboardFilters | void>({
      queryFn: async (raw) => {
        const f: CustomerDashboardFilters = raw ?? {};
        const statuses: CustomerLeadStatus[] = [
          "new",
          "no_answer",
          "call_back",
          "qualified",
          "not_interested",
          "unqualified",
          "duplicate",
          "closed",
        ];

        // Supabase PostgrestFilterBuilder generics exceed TS recursion limits when chained here.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentional escape hatch for query chain
        const applyDashboardFilters = (q: any) => {
          let out = q;
          if (f.dateFrom) out = out.gte("created_at", f.dateFrom);
          if (f.dateTo) out = out.lte("created_at", `${f.dateTo}T23:59:59.999Z`);
          if (f.categoryId && f.categoryId !== "all") {
            out = out.eq("category_id", f.categoryId);
          }
          if (f.country && f.country !== "all") {
            out = out.eq("country", f.country);
          }
          if (f.assignedTo && f.assignedTo !== "all") {
            out = out.eq("assigned_to", f.assignedTo);
          }
          return out;
        };

        let totalQ = sb().from("customer_leads").select("*", {
          head: true,
          count: "exact",
        });
        totalQ = applyDashboardFilters(totalQ);
        const totalRes = await totalQ;
        if (totalRes.error) return { error: totalRes.error };

        const byStatus: Record<CustomerLeadStatus, number> = {
          new: 0,
          no_answer: 0,
          call_back: 0,
          qualified: 0,
          not_interested: 0,
          unqualified: 0,
          duplicate: 0,
          closed: 0,
        };
        for (const s of statuses) {
          let rq = sb().from("customer_leads").select("*", {
            head: true,
            count: "exact",
          }).eq("status", s);
          rq = applyDashboardFilters(rq);
          const r = await rq;
          if (r.error) return { error: r.error };
          byStatus[s] = r.count ?? 0;
        }

        let byDayQ = sb().from("customer_leads").select("created_at");
        byDayQ = applyDashboardFilters(byDayQ);
        const byDayRes = await byDayQ;
        if (byDayRes.error) return { error: byDayRes.error };
        const byDayMap = new Map<string, number>();
        for (const row of byDayRes.data ?? []) {
          const k = new Date(row.created_at as string).toISOString().slice(0, 10);
          byDayMap.set(k, (byDayMap.get(k) ?? 0) + 1);
        }

        let catQ = sb().from("customer_leads").select("categories(name)");
        catQ = applyDashboardFilters(catQ);
        const catRes = await catQ;
        if (catRes.error) return { error: catRes.error };
        const byCatMap = new Map<string, number>();
        for (const row of catRes.data ?? []) {
          const n = (row as { categories?: { name?: string } | null }).categories?.name ?? "Unknown";
          byCatMap.set(n, (byCatMap.get(n) ?? 0) + 1);
        }

        return {
          data: {
            totalLeads: totalRes.count ?? 0,
            byStatus,
            leadsByDay: [...byDayMap.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([day, count]) => ({ day, count })),
            byCategory: [...byCatMap.entries()]
              .map(([name, count]) => ({ name, count }))
              .sort((a, b) => b.count - a.count),
          },
        };
      },
      providesTags: ["ClientDashboard"],
    }),

    getCustomerLeadCountries: builder.query<string[], void>({
      queryFn: async () => {
        const { data, error } = await sb().from("customer_leads").select("country");
        if (error) return { error };
        const seen = new Set<string>();
        for (const row of data ?? []) {
          const c = String((row as { country: string }).country ?? "").trim();
          if (c) seen.add(c);
        }
        return { data: [...seen].sort((a, b) => a.localeCompare(b)) };
      },
      providesTags: ["ClientDashboard"],
    }),

    getSupportContacts: builder.query<SupportContact[], void>({
      queryFn: async () => {
        const { data, error } = await sb()
          .from("support_contacts")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true });
        if (error) return { error };
        return { data: (data ?? []) as SupportContact[] };
      },
      providesTags: ["SupportContacts"],
    }),

    getCustomerAuditLogs: builder.query<CustomerAuditLog[], void>({
      queryFn: async () => {
        const { data, error } = await sb()
          .from("customer_audit_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) return { error };
        return { data: (data ?? []) as CustomerAuditLog[] };
      },
      providesTags: ["ClientAudit"],
    }),

    getWallet: builder.query<WalletData | null, void>({
      queryFn: async () => {
        const { data, error } = await sb().from("wallets").select("*").maybeSingle();
        if (error) return { error };
        return { data: (data as WalletData | null) ?? null };
      },
      providesTags: ["Wallet"],
    }),

    getWalletTransactions: builder.query<WalletTransaction[], void>({
      queryFn: async () => {
        const { data, error } = await sb()
          .from("wallet_transactions")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) return { error };
        return { data: (data ?? []) as WalletTransaction[] };
      },
      providesTags: ["Wallet"],
    }),

    getMyDeliveryEntitlements: builder.query<DeliveryEntitlement[], void>({
      queryFn: async () => {
        const { data, error } = await sb()
          .from("delivery_entitlements")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) return { error };
        return { data: (data ?? []) as DeliveryEntitlement[] };
      },
      providesTags: ["ClientEntitlements"],
    }),

    getMyDeliveryLedger: builder.query<
      (DeliveryLedgerLine & { categories?: { name: string } | null })[],
      void
    >({
      queryFn: async () => {
        const { data, error } = await sb()
          .from("delivery_ledger_lines")
          .select("*, categories(name)")
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) return { error };
        return {
          data: (data ?? []) as (DeliveryLedgerLine & {
            categories?: { name: string } | null;
          })[],
        };
      },
      providesTags: ["ClientDeliveryLedger"],
    }),

    getMyInvoices: builder.query<DeliveryInvoice[], void>({
      queryFn: async () => {
        const { data, error } = await sb()
          .from("delivery_invoices")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) return { error };
        return { data: (data ?? []) as DeliveryInvoice[] };
      },
      providesTags: ["ClientInvoices"],
    }),

    getClientPackages: builder.query<ClientCatalogPackage[], void>({
      queryFn: async () => {
        const res = await fetch("/api/client/packages");
        const json = (await res.json().catch(() => ({}))) as {
          data?: ClientCatalogPackage[];
          error?: string;
        };
        if (!res.ok) {
          return { error: { status: res.status, data: json.error ?? "Request failed" } };
        }
        return { data: json.data ?? [] };
      },
      providesTags: ["Packages"],
    }),

    getClientOffers: builder.query<OfferWithPackage[], void>({
      queryFn: async () => {
        const res = await fetch("/api/client/offers");
        const json = (await res.json().catch(() => ({}))) as {
          data?: OfferWithPackage[];
          error?: string;
        };
        if (!res.ok) {
          return { error: { status: res.status, data: json.error ?? "Request failed" } };
        }
        return { data: json.data ?? [] };
      },
      providesTags: ["Packages"],
    }),

    purchasePackage: builder.mutation<
      { purchase_id: string; total_amount_cents: number; leads_allocated: number },
      { package_id: string; quantity: number }
    >({
      queryFn: async (body) => {
        const res = await requestJson<{
          purchase_id: string;
          total_amount_cents: number;
          leads_allocated: number;
        }>("/api/client/purchase", "POST", body);
        if (res.error) return { error: res.error };
        return { data: res.data! };
      },
      invalidatesTags: ["Wallet", "ClientLeads", "ClientDashboard", "ClientAudit"],
    }),

    createTopupSession: builder.mutation<{ url: string }, { amount_cents: number }>({
      queryFn: async (body) => {
        const res = await requestJson<{ url: string }>(
          "/api/client/billing/topup-session",
          "POST",
          body
        );
        if (res.error) return { error: res.error };
        return { data: res.data! };
      },
    }),

    createPrepaidSession: builder.mutation<{ url: string }, { amount_cents: number }>({
      queryFn: async (body) => {
        const res = await requestJson<{ url: string }>(
          "/api/client/billing/prepaid-session",
          "POST",
          body
        );
        if (res.error) return { error: res.error };
        return { data: res.data! };
      },
      invalidatesTags: ["ClientEntitlements", "ClientDeliveryLedger"],
    }),

    getOrgUsers: builder.query<OrgUserWithLastLogin[], void>({
      queryFn: async () => {
        const res = await fetch("/api/client/users");
        const json = (await res.json().catch(() => ({}))) as {
          data?: OrgUserWithLastLogin[];
          error?: string;
        };
        if (!res.ok) return { error: { status: res.status, data: json.error ?? "Request failed" } };
        return { data: json.data ?? [] };
      },
      providesTags: ["ClientUsers"],
    }),

    createOrgUser: builder.mutation<
      { ok: true },
      { email: string; password: string; full_name?: string; role: "customer_admin" | "customer_agent" }
    >({
      queryFn: async (body) => {
        const res = await requestJson<{ ok: true }>("/api/client/users", "POST", body);
        if (res.error) return { error: res.error };
        return { data: { ok: true } };
      },
      invalidatesTags: ["ClientUsers", "ClientAudit"],
    }),

    updateOrgUser: builder.mutation<
      { ok: true; reset_link?: string | null },
      {
        id: string;
        is_active?: boolean;
        role?: "customer_admin" | "customer_agent";
        password?: string;
        send_password_reset?: boolean;
      }
    >({
      queryFn: async ({ id, ...body }) => {
        const res = await requestJson<{ ok: true; reset_link?: string | null }>(
          `/api/client/users/${id}`,
          "PATCH",
          body
        );
        if (res.error) return { error: res.error };
        return { data: res.data! };
      },
      invalidatesTags: ["ClientUsers", "ClientAudit"],
    }),

    getLeadFlows: builder.query<CustomerLeadFlow[], void>({
      queryFn: async () => {
        const res = await fetch("/api/client/lead-flows");
        const json = (await res.json().catch(() => ({}))) as {
          data?: CustomerLeadFlow[];
          error?: string;
        };
        if (!res.ok) return { error: { status: res.status, data: json.error ?? "Request failed" } };
        return { data: json.data ?? [] };
      },
      providesTags: ["LeadFlows"],
    }),

    upsertLeadFlow: builder.mutation<
      CustomerLeadFlow,
      {
        package_id: string;
        leads_per_week: number;
        monthly_target_leads?: number;
        business_days_only?: boolean;
        is_active?: boolean;
      }
    >({
      queryFn: async (body) => {
        const res = await requestJson<CustomerLeadFlow>("/api/client/lead-flows", "POST", body);
        if (res.error) return { error: res.error };
        return { data: res.data! };
      },
      invalidatesTags: ["LeadFlows", "ClientAudit"],
    }),

    updateLeadFlow: builder.mutation<
      CustomerLeadFlow,
      {
        id: string;
        leads_per_week?: number;
        monthly_target_leads?: number;
        business_days_only?: boolean;
        is_active?: boolean;
      }
    >({
      queryFn: async ({ id, ...body }) => {
        const res = await requestJson<CustomerLeadFlow>(`/api/client/lead-flows/${id}`, "PATCH", body);
        if (res.error) return { error: res.error };
        return { data: res.data! };
      },
      invalidatesTags: ["LeadFlows"],
    }),

    runLeadFlowsNow: builder.mutation<
      {
        processed: number;
        leads_delivered: number;
        failed: Array<{
          flow_id: string;
          package_id: string;
          package_name: string;
          reason: string;
        }>;
      },
      void
    >({
      queryFn: async () => {
        const res = await requestJson<{
          processed: number;
          leads_delivered: number;
          failed: Array<{
            flow_id: string;
            package_id: string;
            package_name: string;
            reason: string;
          }>;
        }>("/api/client/lead-flows/run", "POST", {});
        if (res.error) return { error: res.error };
        return { data: res.data! };
      },
      invalidatesTags: [
        "LeadFlows",
        "Wallet",
        "ClientLeads",
        "ClientDashboard",
        "ClientAudit",
        "ClientEntitlements",
        "ClientDeliveryLedger",
      ],
    }),
  }),
});

export const {
  useGetClientMeQuery,
  useGetCustomerLeadsQuery,
  useUpdateCustomerLeadMutation,
  useGetCustomerDashboardQuery,
  useGetCustomerLeadCountriesQuery,
  useGetSupportContactsQuery,
  useGetCustomerAuditLogsQuery,
  useGetWalletQuery,
  useGetWalletTransactionsQuery,
  useGetClientPackagesQuery,
  useGetClientOffersQuery,
  usePurchasePackageMutation,
  useCreateTopupSessionMutation,
  useGetMyDeliveryEntitlementsQuery,
  useGetMyDeliveryLedgerQuery,
  useGetMyInvoicesQuery,
  useCreatePrepaidSessionMutation,
  useGetOrgUsersQuery,
  useCreateOrgUserMutation,
  useUpdateOrgUserMutation,
  useGetLeadFlowsQuery,
  useUpsertLeadFlowMutation,
  useUpdateLeadFlowMutation,
  useRunLeadFlowsNowMutation,
} = clientApi;
