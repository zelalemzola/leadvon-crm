type LeadTemplateContext = {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  summary?: string | null;
  status?: string | null;
  category_name?: string | null;
};

export function renderSmsTemplate(template: string, lead: LeadTemplateContext) {
  const fullName = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim();
  const replacements: Record<string, string> = {
    first_name: lead.first_name ?? "",
    last_name: lead.last_name ?? "",
    full_name: fullName,
    phone: lead.phone ?? "",
    summary: lead.summary ?? "",
    status: lead.status ?? "",
    category: lead.category_name ?? "",
  };

  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => {
    const normalized = key.toLowerCase();
    return replacements[normalized] ?? "";
  });
}
