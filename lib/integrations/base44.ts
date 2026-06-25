export type Base44SaLead = {
  id?: string;
  prenom?: string | null;
  nom?: string | null;
  telephone?: string | null;
  age?: string | null;
  province?: string | null;
  work?: string | null;
  income?: string | null;
  debt?: string | null;
  review_status?: string | null;
  last_step?: string | null;
  status?: "new" | "contacted" | "converted" | null;
  created_date?: string | null;
  updated_date?: string | null;
  created_by_id?: string | null;
  created_by?: string | null;
};

function getBaseUrl() {
  return (process.env.BASE44_BASE_URL || "https://choisir-assur-pro.base44.app/api").replace(/\/+$/, "");
}

function getApiKey() {
  const key = process.env.BASE44_API_KEY?.trim();
  if (!key) throw new Error("Server missing BASE44_API_KEY");
  return key;
}

export async function listBase44SaLeads(args: {
  limit: number;
  skip: number;
  sortBy?: string;
  query?: Record<string, string>;
}): Promise<Base44SaLead[]> {
  const url = new URL(`${getBaseUrl()}/entities/SaLead`);
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
    throw new Error(`Base44 SaLead list failed (${res.status}): ${text || res.statusText}`);
  }
  const json = (await res.json().catch(() => [])) as unknown;
  if (!Array.isArray(json)) return [];
  return json as Base44SaLead[];
}
