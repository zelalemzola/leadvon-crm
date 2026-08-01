export type Base44WmLead = {
  id?: string;
  prenom?: string | null;
  nom?: string | null;
  email?: string | null;
  telephone?: string | null;
  q1?: string | null;
  q2?: string | null;
  q3?: string | null;
  q4?: string | null;
  q5?: string | null;
  status?: "new" | "contacted" | "converted" | null;
  source?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  created_date?: string | null;
  updated_date?: string | null;
  created_by_id?: string | null;
  created_by?: string | null;
};

function getBaseUrl() {
  return (
    process.env.WMLEADS_BASE_URL ||
    "https://beratervermittlung.base44.app/api"
  ).replace(/\/+$/, "");
}

function getApiKey() {
  const key =
    process.env.WMLEADS_API_KEY?.trim() || process.env.BASE44_API_KEY?.trim();
  if (!key) throw new Error("Server missing WMLEADS_API_KEY (or BASE44_API_KEY fallback)");
  return key;
}

export async function listBase44WmLeads(args: {
  limit: number;
  skip: number;
  sortBy?: string;
  query?: Record<string, string>;
}): Promise<Base44WmLead[]> {
  const url = new URL(`${getBaseUrl()}/entities/WmLead`);
  url.searchParams.set("limit", String(args.limit));
  url.searchParams.set("skip", String(args.skip));
  url.searchParams.set("sort_by", args.sortBy ?? "created_date");
  if (args.query && Object.keys(args.query).length > 0) {
    url.searchParams.set("q", JSON.stringify(args.query));
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      api_key: getApiKey(),
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Base44 WmLead list failed (${res.status}): ${text || res.statusText}`);
  }
  const json = (await res.json().catch(() => [])) as unknown;
  if (!Array.isArray(json)) return [];
  return json as Base44WmLead[];
}
