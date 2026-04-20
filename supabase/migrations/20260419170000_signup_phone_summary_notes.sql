-- Signup/contact fields + lead wording shift:
-- - Collect org/profile phone
-- - Use `summary` for lead content
-- - Keep `notes` on customer_leads for agent comments

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS summary text NOT NULL DEFAULT '';

ALTER TABLE public.customer_leads
  ADD COLUMN IF NOT EXISTS summary text NOT NULL DEFAULT '';

-- Backfill summary from legacy notes where summary is still blank.
UPDATE public.leads
SET summary = COALESCE(NULLIF(notes, ''), '')
WHERE COALESCE(summary, '') = '';

UPDATE public.customer_leads
SET summary = COALESCE(NULLIF(notes, ''), '')
WHERE COALESCE(summary, '') = '';

-- Backward compatibility: legacy insert paths that still write only `notes`
-- will get `summary` populated on insert.
CREATE OR REPLACE FUNCTION public.ensure_lead_summary_from_legacy_notes ()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF COALESCE(NEW.summary, '') = '' AND COALESCE(NEW.notes, '') <> '' THEN
    NEW.summary := NEW.notes;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_summary_from_notes ON public.leads;
CREATE TRIGGER leads_summary_from_notes
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_lead_summary_from_legacy_notes ();

DROP TRIGGER IF EXISTS customer_leads_summary_from_notes ON public.customer_leads;
CREATE TRIGGER customer_leads_summary_from_notes
  BEFORE INSERT ON public.customer_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_lead_summary_from_legacy_notes ();
