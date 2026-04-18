import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import { createClient } from "@/lib/supabase/client";
import type {
  Category,
  Lead,
  LeadOffer,
  LeadPackage,
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

type LeadsQueryParams = {
  categoryId?: string | null;
  search?: string;
  page?: number;
  pageSize?: number;
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
  tagTypes: ["Leads", "Categories", "Packages", "Offers", "Staff", "Dashboard", "SupportContacts"],
  endpoints: (builder) => ({
    getDashboardStats: builder.query<DashboardStats, void>({
      queryFn: async () => {
        const supabase = sb();
        const [
          byDay,
          byCat,
          totalCountRow,
          soldRow,
          unsoldRow,
          pkgCountRow,
          catCountRow,
        ] = await Promise.all([
          supabase.rpc("admin_leads_created_by_day", { days_back: 30 }),
          supabase.rpc("admin_leads_by_category"),
          supabase.from("leads").select("*", { count: "exact", head: true }),
          supabase
            .from("leads")
            .select("*", { count: "exact", head: true })
            .not("sold_at", "is", null),
          supabase
            .from("leads")
            .select("*", { count: "exact", head: true })
            .is("sold_at", null),
          supabase
            .from("lead_packages")
            .select("*", { count: "exact", head: true })
            .eq("active", true),
          supabase.from("categories").select("*", { count: "exact", head: true }),
        ]);

        if (byDay.error) return { error: byDay.error };
        if (byCat.error) return { error: byCat.error };
        if (totalCountRow.error) return { error: totalCountRow.error };
        if (soldRow.error) return { error: soldRow.error };
        if (unsoldRow.error) return { error: unsoldRow.error };
        if (pkgCountRow.error) return { error: pkgCountRow.error };
        if (catCountRow.error) return { error: catCountRow.error };
        const staffActivityRow = await supabase.rpc("admin_activity_by_staff", {
          days_back: 14,
        });

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
      queryFn: async ({ categoryId, search = "", page = 1, pageSize = 25 }) => {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        let q = sb()
          .from("leads")
          .select("*, categories(id, name, slug)")
          .order("created_at", { ascending: false })
          .range(from, to);
        if (categoryId) {
          q = q.eq("category_id", categoryId);
        }
        if (search.trim()) {
          const term = search.trim();
          q = q.or(
            `first_name.ilike.%${term}%,last_name.ilike.%${term}%,phone.ilike.%${term}%,notes.ilike.%${term}%`
          );
        }
        const { data, error } = await q;
        if (error) return { error };
        let countQuery = sb()
          .from("leads")
          .select("*", { count: "exact", head: true });
        if (categoryId) countQuery = countQuery.eq("category_id", categoryId);
        if (search.trim()) {
          const term = search.trim();
          countQuery = countQuery.or(
            `first_name.ilike.%${term}%,last_name.ilike.%${term}%,phone.ilike.%${term}%,notes.ilike.%${term}%`
          );
        }
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

    createLead: builder.mutation<
      Lead,
      Pick<Lead, "category_id" | "phone" | "first_name" | "last_name" | "country" | "notes"> & {
        sold_at?: string | null;
      }
    >({
      queryFn: async (body) => {
        const res = await jsonRequest<LeadWithCategory>("/api/admin/leads", "POST", {
          category_id: body.category_id,
          phone: body.phone,
          first_name: body.first_name,
          last_name: body.last_name,
          country: body.country,
          notes: body.notes,
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
  }),
});

export const {
  useGetDashboardStatsQuery,
  useGetCategoriesQuery,
  useGetLeadsQuery,
  useGetPackagesQuery,
  useGetStaffQuery,
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
} = adminApi;
