-- Base44 zip code pipeline:
-- 1) Persist Base44 code_postal on inventory leads
-- 2) Copy zip_code to customer leads at delivery time
-- 3) Backfill existing records from source payload/history

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS zip_code text;

ALTER TABLE public.customer_leads
  ADD COLUMN IF NOT EXISTS zip_code text;

CREATE INDEX IF NOT EXISTS idx_customer_leads_org_zip_code
  ON public.customer_leads (organization_id, zip_code);

-- Keep delivery code paths simple by auto-copying zip from source lead when omitted.
CREATE OR REPLACE FUNCTION public.ensure_customer_lead_zip_from_source ()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $$
DECLARE
  v_source_zip text;
BEGIN
  IF COALESCE(NEW.zip_code, '') = '' AND NEW.source_lead_id IS NOT NULL THEN
    SELECT l.zip_code
    INTO v_source_zip
    FROM public.leads l
    WHERE l.id = NEW.source_lead_id;

    IF COALESCE(v_source_zip, '') <> '' THEN
      NEW.zip_code := v_source_zip;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_leads_zip_from_source ON public.customer_leads;
CREATE TRIGGER customer_leads_zip_from_source
  BEFORE INSERT ON public.customer_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_customer_lead_zip_from_source ();

-- Backfill inventory zip from Base44 payload where available.
UPDATE public.leads l
SET zip_code = NULLIF(TRIM(COALESCE(l.source_payload ->> 'code_postal', '')), '')
WHERE l.source_system = 'base44'
  AND COALESCE(l.zip_code, '') = ''
  AND COALESCE(l.source_payload ->> 'code_postal', '') <> '';

-- Backfill customer copies from inventory lead zip.
UPDATE public.customer_leads cl
SET zip_code = l.zip_code
FROM public.leads l
WHERE cl.source_lead_id = l.id
  AND COALESCE(cl.zip_code, '') = ''
  AND COALESCE(l.zip_code, '') <> '';
