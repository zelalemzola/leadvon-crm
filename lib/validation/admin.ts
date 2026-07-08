import { z } from "zod";

export const leadSchema = z.object({
  category_id: z.string().uuid(),
  lead_unit_type: z.enum(["single", "family"]).optional().default("single"),
  phone: z.string().trim().min(4).max(32),
  first_name: z.string().trim().min(1).max(120),
  last_name: z.string().trim().min(1).max(120),
  country: z.string().trim().min(1).max(120),
  summary: z.string().max(2000).optional(),
  review_status: z.string().trim().max(64).nullable().optional(),
  // Backward compatibility for older imports/forms.
  notes: z.string().max(2000).optional(),
  sold_at: z.string().datetime().nullable().optional(),
});

export const leadCsvImportRowSchema = z
  .object({
    category_id: z.string().uuid(),
    lead_unit_type: z.enum(["single", "family"]).optional().default("single"),
    phone: z.string().trim().min(4).max(32),
    first_name: z.string().trim().max(120).default(""),
    last_name: z.string().trim().max(120).default(""),
    country: z.string().trim().min(1).max(120).default("Unknown"),
    summary: z.string().max(2000).optional().default(""),
    zip_code: z.string().trim().max(64).nullable().optional(),
  })
  .refine((row) => row.first_name.length > 0 || row.last_name.length > 0, {
    message: "At least first_name or last_name is required",
    path: ["first_name"],
  });

export const leadCsvImportRequestSchema = z.object({
  rows: z.array(leadCsvImportRowSchema).min(1).max(5000),
});

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9-]+$/),
});

export const packageSchema = z.object({
  category_id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  description: z.string().max(1000).optional().default(""),
  price_cents: z.number().int().min(0),
  currency: z.string().trim().length(3).default("USD"),
  leads_count: z.number().int().positive(),
  stripe_price_id: z.string().trim().optional().nullable(),
  active: z.boolean().default(true),
});

export const offerSchema = z.object({
  package_id: z.string().uuid(),
  title: z.string().trim().min(2).max(120),
  description: z.string().max(1000).optional().default(""),
  discount_percent: z.number().min(0).max(100),
  starts_at: z.string().datetime().nullable().optional(),
  ends_at: z.string().datetime().nullable().optional(),
  active: z.boolean().default(true),
});

export const inviteStaffSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  full_name: z.string().trim().max(150).optional().default(""),
});

export const createCustomerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  full_name: z.string().trim().min(1).max(150),
  organization_name: z.string().trim().min(2).max(150),
  phone: z.string().trim().max(40).optional().nullable(),
});

export const organizationPricingOverrideSchema = z.object({
  category_id: z.string().uuid(),
  unit_type: z.enum(["single", "family"]),
  price_cents: z.number().int().min(0),
  active: z.boolean().default(true),
});

export const organizationFreeDeliverySchema = z.object({
  quota_total: z.number().int().min(1).max(100000),
  is_active: z.boolean(),
  allowed_category_ids: z.array(z.string().uuid()).optional().default([]),
  allowed_source_systems: z
    .array(z.enum(["manual", "base44", "funnel"]))
    .optional()
    .default([]),
  allowed_review_statuses: z.array(z.string().trim().min(1).max(64)).optional().default([]),
  /** YYYY-MM-DD (UTC). Omit to use the default start-of-today when starting a new campaign. */
  eligible_from: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()])
    .optional(),
});

export const updateStaffSchema = z.object({
  role: z.enum(["staff", "customer_admin", "customer_agent"]).optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(8).max(128).optional(),
});

export const supportContactSchema = z.object({
  title: z.string().trim().min(1).max(120),
  email: z.string().email().optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  description: z.string().max(1000).optional().default(""),
  sort_order: z.number().int().min(0).max(999).optional().default(0),
  organization_id: z.string().uuid().nullable().optional(),
});
