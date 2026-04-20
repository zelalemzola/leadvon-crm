import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import { createClient } from "@/lib/supabase/client";
import type {
  Category,
  CustomerDirectoryRow,
  CustomerWithOrganization,
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

export type AdminLeadsAvailability = "all" | "available" | "sold";
export type AdminLeadsSort = "newest" | "oldest";

export type DeliverPrepaidLeadResult = {
  customer_lead_id: string;
  entitlement_id: string;
  amount_cents: number;
  balance_after_cents: number;
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

    getCustomers: builder.query<CustomerDirectoryRow[], void>({
      queryFn: async () => {
        const supabase = sb();
        const { data: profiles, error } = await supabase
          .from("profiles")
          .select("*, organizations(id, name)")
          .in("role", ["customer_admin", "customer_agent"])
          .order("created_at", { ascending: false });
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

        const rows: CustomerDirectoryRow[] = (profiles ?? []).map((p) => {
          const c = p as CustomerWithOrganization;
          return {
            ...c,
            leadsPurchasedCount: c.organization_id
              ? (countByOrg.get(c.organization_id) ?? 0)
              : 0,
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
  useCreateSupportContactMutation,
  useUpdateSupportContactMutation,
  useDeleteSupportContactMutation,
  useGetLeadPricebookQuery,
  useUpdateLeadPricebookMutation,
  useGetDeliveryEntitlementsQuery,
  useDeliverPrepaidLeadMutation,
} = adminApi;
