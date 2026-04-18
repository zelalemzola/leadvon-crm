export type UserRole = "staff" | "customer_admin" | "customer_agent";

export type Profile = {
  id: string;
  organization_id: string | null;
  role: UserRole;
  is_active: boolean;
  email: string | null;
  full_name: string | null;
  created_at: string;
  updated_at: string;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};

export type Lead = {
  id: string;
  category_id: string;
  phone: string;
  first_name: string;
  last_name: string;
  country: string;
  notes: string;
  created_at: string;
  updated_at: string;
  sold_at: string | null;
};

export type LeadPackage = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  leads_count: number;
  stripe_price_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type LeadWithCategory = Lead & {
  categories: Pick<Category, "id" | "name" | "slug"> | null;
};

export type PackageWithCategory = LeadPackage & {
  categories: Pick<Category, "id" | "name" | "slug"> | null;
};

export type LeadOffer = {
  id: string;
  package_id: string;
  title: string;
  description: string;
  discount_percent: number;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type OfferWithPackage = LeadOffer & {
  lead_packages: Pick<LeadPackage, "id" | "name" | "category_id"> | null;
};

export type SupportContact = {
  id: string;
  organization_id: string | null;
  sort_order: number;
  title: string;
  email: string | null;
  phone: string | null;
  description: string;
  created_at: string;
  updated_at: string;
};

export type CustomerAuditLog = {
  id: string;
  organization_id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};
