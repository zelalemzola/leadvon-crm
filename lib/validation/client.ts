import { z } from "zod";

export const clientLeadPatchSchema = z.object({
  status: z
    .enum([
      "new",
      "no_answer",
      "call_back",
      "qualified",
      "not_interested",
      "unqualified",
      "duplicate",
      "closed",
    ])
    .optional(),
  notes: z.string().max(2000).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  call_count: z.number().int().min(0).max(9999).optional(),
});

export const customerLeadFlowSchema = z.object({
  category_id: z.string().uuid(),
  unit_type: z.enum(["single", "family"]).default("single"),
  leads_per_week: z.number().int().min(1).max(5000),
  monthly_target_leads: z.number().int().min(1).max(50000).optional(),
  business_days_only: z.boolean().optional().default(true),
  is_active: z.boolean().optional().default(true),
});
