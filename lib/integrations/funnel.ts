import { createClient } from "@supabase/supabase-js";

export type FunnelFormSubmission = {
  id: string;
  funnel_id: string;
  page_id: string;
  answers: Record<string, unknown> | null;
  geo: Record<string, unknown> | null;
  user_agent: string | null;
  referrer: string | null;
  created_at: string;
};

function getFunnelSupabaseUrl() {
  const value = process.env.FUNNEL_SUPABASE_URL?.trim();
  if (!value) throw new Error("Missing FUNNEL_SUPABASE_URL");
  return value;
}

function getFunnelServiceRoleKey() {
  const value = process.env.FUNNEL_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!value) throw new Error("Missing FUNNEL_SUPABASE_SERVICE_ROLE_KEY");
  return value;
}

function createFunnelClient() {
  return createClient(getFunnelSupabaseUrl(), getFunnelServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function listFunnelFormSubmissions(args: {
  limit: number;
  offset: number;
  createdFrom?: string | null;
}): Promise<FunnelFormSubmission[]> {
  const client = createFunnelClient();
  let query = client
    .from("funnel_form_submissions")
    .select("id,funnel_id,page_id,answers,geo,user_agent,referrer,created_at")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(args.offset, args.offset + args.limit - 1);

  if (args.createdFrom?.trim()) {
    query = query.gte("created_at", args.createdFrom.trim());
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Funnel submissions list failed: ${error.message}`);
  }
  return (data ?? []) as FunnelFormSubmission[];
}
