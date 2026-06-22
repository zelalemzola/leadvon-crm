-- Track manual outreach attempts per customer lead (agent-entered call count).

ALTER TABLE public.customer_leads
  ADD COLUMN IF NOT EXISTS call_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.customer_leads
  DROP CONSTRAINT IF EXISTS customer_leads_call_count_non_negative;

ALTER TABLE public.customer_leads
  ADD CONSTRAINT customer_leads_call_count_non_negative CHECK (call_count >= 0);
