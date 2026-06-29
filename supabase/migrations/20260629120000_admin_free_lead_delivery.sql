-- Admin manual free lead delivery:
-- Let staff gift any available inventory lead to a chosen organization for free,
-- independent of the free-delivery campaign quotas (organization_free_delivery).
-- The lead is marked sold and copied into the org's customer_leads with
-- grant_source = 'free_delivery' (no charge, no purchase/entitlement), and is
-- auto-assigned via the same weighted assignee logic used by other deliveries.

CREATE OR REPLACE FUNCTION public.deliver_free_lead_to_org (
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
  v_assignee uuid;
BEGIN
  PERFORM 1
  FROM public.organizations o
  WHERE o.id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found';
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

  v_assignee := public.pick_weighted_assignee(p_organization_id);

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
    country,
    lead_unit_type,
    charged_amount_cents,
    entitlement_id,
    grant_source,
    assigned_to)
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
    v_lead.country,
    v_lead.lead_unit_type,
    0,
    NULL,
    'free_delivery',
    v_assignee)
RETURNING
  id INTO v_cl_id;

  RETURN QUERY
  SELECT
    v_cl_id,
    'free_delivery'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.deliver_free_lead_to_org (uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deliver_free_lead_to_org (uuid, uuid) TO service_role;
