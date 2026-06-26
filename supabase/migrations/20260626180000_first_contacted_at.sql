-- Track when a lead first moves out of the "new" status (time-to-first-contact).

ALTER TABLE public.customer_leads
  ADD COLUMN IF NOT EXISTS first_contacted_at timestamptz NULL;

UPDATE public.customer_leads
SET first_contacted_at = status_updated_at
WHERE status <> 'new'
  AND first_contacted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customer_leads_org_first_contacted
  ON public.customer_leads (organization_id, first_contacted_at);
