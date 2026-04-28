-- One-time signup free delivery:
-- Allow admin to grant exactly one free lead to a first-time customer organization.

ALTER TABLE public.customer_leads
  ADD COLUMN IF NOT EXISTS grant_source text NOT NULL DEFAULT 'paid';

UPDATE public.customer_leads
SET grant_source = 'paid'
WHERE grant_source IS NULL OR grant_source = '';

ALTER TABLE public.customer_leads
  DROP CONSTRAINT IF EXISTS customer_leads_wallet_or_prepaid;

ALTER TABLE public.customer_leads
  DROP CONSTRAINT IF EXISTS customer_leads_funding_mode_check;

ALTER TABLE public.customer_leads
  ADD CONSTRAINT customer_leads_funding_mode_check CHECK (
    (
      purchase_id IS NOT NULL
      AND entitlement_id IS NULL
      AND grant_source = 'paid'
    )
    OR (
      purchase_id IS NULL
      AND entitlement_id IS NOT NULL
      AND grant_source = 'paid'
    )
    OR (
      purchase_id IS NULL
      AND entitlement_id IS NULL
      AND grant_source = 'signup_free'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_leads_one_signup_free_per_org
  ON public.customer_leads (organization_id)
  WHERE grant_source = 'signup_free';

CREATE OR REPLACE FUNCTION public.deliver_signup_free_lead (
  p_organization_id uuid,
  p_source_lead_id uuid)
  RETURNS TABLE (
    customer_lead_id uuid,
    grant_source text)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_cl_id uuid;
BEGIN
  PERFORM 1
  FROM public.organizations o
  WHERE o.id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.customer_leads cl
    WHERE cl.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Signup free lead is only available before first delivery';
  END IF;

  SELECT
    l.* INTO v_lead
  FROM
    public.leads l
  WHERE
    l.id = p_source_lead_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;
  IF v_lead.sold_at IS NOT NULL THEN
    RAISE EXCEPTION 'Lead already sold';
  END IF;

  UPDATE
    public.leads
  SET
    sold_at = now()
  WHERE
    id = p_source_lead_id;

  INSERT INTO public.customer_leads (
    organization_id,
    source_lead_id,
    category_id,
    purchase_id,
    phone,
    first_name,
    last_name,
    notes,
    summary,
    lead_unit_type,
    charged_amount_cents,
    entitlement_id,
    grant_source)
  VALUES (
    p_organization_id,
    p_source_lead_id,
    v_lead.category_id,
    NULL,
    v_lead.phone,
    v_lead.first_name,
    v_lead.last_name,
    COALESCE(v_lead.notes, ''),
    COALESCE(v_lead.summary, ''),
    v_lead.lead_unit_type,
    0,
    NULL,
    'signup_free')
RETURNING
  id INTO v_cl_id;

  RETURN QUERY
  SELECT
    v_cl_id,
    'signup_free'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.deliver_signup_free_lead (uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deliver_signup_free_lead (uuid, uuid) TO service_role;
