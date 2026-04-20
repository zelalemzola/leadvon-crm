-- Prepaid delivery: charge active entitlement from lead_pricebook, copy lead to customer_leads without wallet package purchase.

ALTER TABLE public.customer_leads
  ALTER COLUMN purchase_id DROP NOT NULL;

ALTER TABLE public.customer_leads
  ADD CONSTRAINT customer_leads_wallet_or_prepaid CHECK (
    (purchase_id IS NOT NULL AND entitlement_id IS NULL)
    OR (purchase_id IS NULL AND entitlement_id IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.deliver_lead_from_prepaid_budget (
  p_organization_id uuid,
  p_source_lead_id uuid)
  RETURNS TABLE (
    customer_lead_id uuid,
    entitlement_id uuid,
    amount_cents bigint,
    balance_after_cents bigint)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_price bigint;
  v_ent public.delivery_entitlements%ROWTYPE;
  v_new_remaining bigint;
  v_cl_id uuid;
BEGIN
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

  SELECT
    lp.price_cents INTO v_price
  FROM
    public.lead_pricebook lp
  WHERE
    lp.category_id = v_lead.category_id
    AND lp.unit_type = v_lead.lead_unit_type
    AND lp.active = TRUE;
  IF v_price IS NULL THEN
    RAISE EXCEPTION 'No active price for this category and unit type';
  END IF;

  SELECT
    e.* INTO v_ent
  FROM
    public.delivery_entitlements e
  WHERE
    e.organization_id = p_organization_id
    AND e.status = 'active'
    AND e.period_start <= now()
    AND e.period_end > now()
    AND e.budget_cents_remaining >= v_price
  ORDER BY
    e.period_start ASC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient prepaid budget';
  END IF;

  v_new_remaining := v_ent.budget_cents_remaining - v_price;

  UPDATE
    public.delivery_entitlements e
  SET
    budget_cents_remaining = v_new_remaining,
    status = CASE WHEN v_new_remaining = 0 THEN
      'depleted'::public.delivery_entitlement_status
    ELSE
      e.status
    END
  WHERE
    e.id = v_ent.id;

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
    country,
    lead_unit_type,
    charged_amount_cents,
    entitlement_id)
  VALUES (
    p_organization_id,
    p_source_lead_id,
    v_lead.category_id,
    NULL,
    v_lead.phone,
    v_lead.first_name,
    v_lead.last_name,
    v_lead.notes,
    v_lead.country,
    v_lead.lead_unit_type,
    v_price::integer,
    v_ent.id)
RETURNING
  id INTO v_cl_id;

  INSERT INTO public.delivery_ledger_lines (
    entitlement_id,
    organization_id,
    amount_cents,
    balance_after_cents,
    unit_type,
    category_id,
    customer_lead_id,
    description)
  VALUES (
    v_ent.id,
    p_organization_id,
    v_price,
    v_new_remaining,
    v_lead.lead_unit_type,
    v_lead.category_id,
    v_cl_id,
    'Prepaid lead delivery');

  RETURN QUERY
  SELECT
    v_cl_id,
    v_ent.id,
    v_price,
    v_new_remaining;
END;
$$;

REVOKE ALL ON FUNCTION public.deliver_lead_from_prepaid_budget (uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deliver_lead_from_prepaid_budget (uuid, uuid) TO service_role;
