export type UserRole = "staff" | "customer_admin" | "customer_agent";

export type Organization = {
  id: string;
  name: string;
  phone: string | null;
  created_at: string;
};

export type Profile = {
  id: string;
  organization_id: string | null;
  role: UserRole;
  is_active: boolean;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
};

/** Customer-side roles; used for admin directory listings. */
export type CustomerWithOrganization = Profile & {
  organizations: Pick<Organization, "id" | "name"> | null;
};

/** Admin customers table: one row per client organization. */
export type CustomerDirectoryRow = {
  id: string;
  organization_id: string;
  organizations: Pick<Organization, "id" | "name">;
  phone: string | null;
  created_at: string;
  leadsPurchasedCount: number;
  adminsCount: number;
  agentsCount: number;
  membersCount: number;
  activeMembersCount: number;
  is_active: boolean;
  primary_admin_id: string | null;
  primary_admin_email: string | null;
  primary_admin_name: string | null;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  source_system?: string | null;
  source_external_value?: string | null;
};

/** Inventory / customer lead unit for prepaid drawdown pricing. */
export type LeadUnitType = "single" | "family";

export type Lead = {
  id: string;
  category_id: string;
  phone: string;
  first_name: string;
  last_name: string;
  country: string;
  summary: string;
  created_at: string;
  updated_at: string;
  sold_at: string | null;
  /** Set after migration `20260418210000`; defaults to single in DB. */
  lead_unit_type?: LeadUnitType;
  /** Source tracking for external lead providers (e.g. Base44). */
  source_system?: string;
  source_external_id?: string | null;
  source_payload?: Record<string, unknown> | null;
  source_created_at?: string | null;
  source_updated_at?: string | null;
};

/** Per category × unit; USD cents. Drives budget drawdown when leads are delivered. */
export type LeadPricebookRow = {
  id: string;
  category_id: string;
  unit_type: LeadUnitType;
  price_cents: number;
  currency: string;
  label: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  categories: Pick<Category, "id" | "name" | "slug"> | null;
};

export type DeliveryEntitlementStatus = "active" | "depleted" | "expired";
export type DeliveryEntitlementSource = "prepaid_purchase" | "topup";

/** Rolling prepaid window (e.g. 30 calendar days from period_start). */
export type DeliveryEntitlement = {
  id: string;
  organization_id: string;
  budget_cents_total: number;
  budget_cents_remaining: number;
  currency: string;
  period_start: string;
  period_end: string;
  source: DeliveryEntitlementSource;
  stripe_payment_ref: string | null;
  status: DeliveryEntitlementStatus;
  created_at: string;
  updated_at: string;
  organizations: Pick<Organization, "id" | "name"> | null;
};

export type DeliveryLedgerLine = {
  id: string;
  entitlement_id: string;
  invoice_id: string | null;
  organization_id: string;
  amount_cents: number;
  balance_after_cents: number;
  unit_type: LeadUnitType;
  category_id: string;
  customer_lead_id: string | null;
  description: string;
  created_at: string;
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
