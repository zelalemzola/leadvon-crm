import { z } from "zod";
import { SMS_MAX_TOPUP_CENTS, SMS_MIN_TOPUP_CENTS } from "@/lib/sms/constants";

const leadStatusEnum = z.enum([
  "new",
  "no_answer",
  "call_back",
  "qualified",
  "not_interested",
  "unqualified",
  "duplicate",
  "closed",
]);

export const smsTopupSessionSchema = z.object({
  amount_cents: z.number().int().min(SMS_MIN_TOPUP_CENTS).max(SMS_MAX_TOPUP_CENTS),
});

export const smsAutomationSchema = z.object({
  name: z.string().min(1).max(120),
  trigger_status: leadStatusEnum,
  message_template: z.string().min(1).max(1600),
  is_active: z.boolean().optional().default(true),
});

export const smsAutomationPatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  trigger_status: leadStatusEnum.optional(),
  message_template: z.string().min(1).max(1600).optional(),
  is_active: z.boolean().optional(),
});

export const sendLeadSmsSchema = z.object({
  lead_id: z.string().uuid(),
  message: z.string().min(1).max(1600),
});

export const callScriptSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(20000),
});

export const callScriptPatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(20000).optional(),
});
