type Base44Lead = {
  id?: string;
  prenom?: string;
  nom?: string;
  telephone?: string;
  email?: string;
  age?: number;
  besoins?: string[];
  couvert_mutuelle?: string;
  mutuelle_actuelle?: string;
  cotisation_mensuelle?: string;
  qui_assurer?: string;
  profession?: string;
  consent_telephone?: boolean;
  consent_marketing?: boolean;
  status?: "new" | "contacted" | "converted";
  created_date?: string;
  updated_date?: string;
  created_by?: string;
};

function getBaseUrl() {
  return (process.env.BASE44_BASE_URL || "https://choisir-assur-pro.base44.app/api").replace(/\/+$/, "");
}

function getApiKey() {
  const key = process.env.BASE44_API_KEY?.trim();
  if (!key) throw new Error("Server missing BASE44_API_KEY");
  return key;
}

export async function listBase44Leads(args: {
  limit: number;
  skip: number;
  sortBy?: string;
}): Promise<Base44Lead[]> {
  const url = new URL(`${getBaseUrl()}/entities/Lead`);
  url.searchParams.set("limit", String(args.limit));
  url.searchParams.set("skip", String(args.skip));
  url.searchParams.set("sort_by", args.sortBy ?? "created_date");

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
    throw new Error(`Base44 list failed (${res.status}): ${text || res.statusText}`);
  }
  const json = (await res.json().catch(() => [])) as unknown;
  if (!Array.isArray(json)) return [];
  return json as Base44Lead[];
}

export type { Base44Lead };
