import { z } from "zod";

export const leadSchema = z.object({
  category_id: z.string().uuid(),
  phone: z.string().trim().min(4).max(32),
  first_name: z.string().trim().min(1).max(120),
  last_name: z.string().trim().min(1).max(120),
  country: z.string().trim().min(1).max(120),
  notes: z.string().max(2000).optional().default(""),
  sold_at: z.string().datetime().nullable().optional(),
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
