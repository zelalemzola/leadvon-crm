-- 1) Multi-bucket prepaid: charge one lead price across FIFO entitlements (oldest period_start first).
-- 2) Lead flows / cron: customer_purchase_package_for_org uses pricebook per lead + prepaid (no wallet).

CREATE OR REPLACE FUNCTION public._deliver_one_inventory_lead_prepaid (
  p_organization_id uuid,
  p_source_lead_id uuid,
  p_ledger_description text DEFAULT 'Prepaid lead delivery')
  RETURNS TABLE (
    customer_lead_id uuid,
    primary_entitlement_id uuid,
    amount_cents bigint,
    primary_balance_after_cents bigint)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_price bigint;
  v_need bigint;
  v_ent public.delivery_entitlements%ROWTYPE;
  v_take bigint;
  v_new_rem bigint;
  v_primary uuid;
  v_cl_id uuid;
  v_ent_ids uuid[] := ARRAY[]::uuid[];
  v_takes bigint[] := ARRAY[]::bigint[];
  v_bals bigint[] := ARRAY[]::bigint[];
  v_sum bigint;
  v_pb bigint;
  i integer;
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
  IF v_price <= 0 THEN
    RAISE EXCEPTION 'Invalid price for this category and unit type';
  END IF;

  SELECT
    COALESCE(SUM(e.budget_cents_remaining), 0) INTO v_sum
  FROM
    public.delivery_entitlements e
  WHERE
    e.organization_id = p_organization_id
    AND e.status = 'active'
    AND e.period_start <= now()
    AND e.period_end > now();
  IF v_sum < v_price THEN
    RAISE EXCEPTION 'Insufficient prepaid budget';
  END IF;

  v_need := v_price;
  v_primary := NULL;

  FOR v_ent IN
  SELECT
    e.*
  FROM
    public.delivery_entitlements e
  WHERE
    e.organization_id = p_organization_id
    AND e.status = 'active'
    AND e.period_start <= now()
    AND e.period_end > now()
    AND e.budget_cents_remaining > 0
  ORDER BY
    e.period_start ASC
  FOR UPDATE OF e
    LOOP
      EXIT WHEN v_need <= 0;
      v_take := LEAST(v_ent.budget_cents_remaining, v_need);
      IF v_take <= 0 THEN
        CONTINUE;
      END IF;
      IF v_primary IS NULL THEN
        v_primary := v_ent.id;
      END IF;
      v_new_rem := v_ent.budget_cents_remaining - v_take;
      UPDATE
        public.delivery_entitlements e
      SET
        budget_cents_remaining = v_new_rem,
        status = CASE WHEN v_new_rem = 0 THEN
          'depleted'::public.delivery_entitlement_status
        ELSE
          e.status
        END
      WHERE
        e.id = v_ent.id;
      v_ent_ids := array_append(v_ent_ids, v_ent.id);
      v_takes := array_append(v_takes, v_take);
      v_bals := array_append(v_bals, v_new_rem);
      v_need := v_need - v_take;
    END LOOP;

  IF v_need > 0 THEN
    RAISE EXCEPTION 'Insufficient prepaid budget';
  END IF;
  IF v_primary IS NULL OR array_length(v_ent_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Insufficient prepaid budget';
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
    summary,
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
    COALESCE(NULLIF(v_lead.summary, ''), v_lead.notes, ''),
    '',
    v_lead.country,
    v_lead.lead_unit_type,
    v_price::integer,
    v_primary)
RETURNING
  id INTO v_cl_id;

  FOR i IN 1..array_length(v_ent_ids, 1)
    LOOP
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
        v_ent_ids[i],
        p_organization_id,
        v_takes[i],
        v_bals[i],
        v_lead.lead_unit_type,
        v_lead.category_id,
        v_cl_id,
        p_ledger_description);
    END LOOP;

  SELECT
    e.budget_cents_remaining INTO v_pb
  FROM
    public.delivery_entitlements e
  WHERE
    e.id = v_primary;

  RETURN QUERY
  SELECT
    v_cl_id,
    v_primary,
    v_price,
    v_pb;
END;
$$;

REVOKE ALL ON FUNCTION public._deliver_one_inventory_lead_prepaid (uuid, uuid, text) FROM PUBLIC;

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
BEGIN
  RETURN QUERY
  SELECT
    x.customer_lead_id,
    x.primary_entitlement_id AS entitlement_id,
    x.amount_cents,
    x.primary_balance_after_cents AS balance_after_cents
  FROM
    public._deliver_one_inventory_lead_prepaid (p_organization_id, p_source_lead_id, 'Prepaid lead delivery') AS x;
END;
$$;

REVOKE ALL ON FUNCTION public.deliver_lead_from_prepaid_budget (uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deliver_lead_from_prepaid_budget (uuid, uuid) TO service_role;

-- Org-scoped batch: same as catalog package shape, but charges pricebook per lead from prepaid (FIFO multi-bucket). No wallet / lead_purchases.
CREATE OR REPLACE FUNCTION public.customer_purchase_package_for_org (
  p_org_id uuid,
  p_package_id uuid,
  p_quantity integer,
  p_actor_id uuid)
  RETURNS TABLE (
    purchase_id uuid,
    total_amount_cents bigint,
    leads_allocated integer)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  v_org_id uuid := p_org_id;
  v_package record;
  v_leads_needed integer;
  v_rec record;
  v_line_amt bigint;
  v_total bigint := 0;
  v_n integer := 0;
BEGIN
  IF p_quantity < 1 THEN
    RAISE EXCEPTION 'Quantity must be >= 1';
  END IF;

  SELECT
    lp.* INTO v_package
  FROM
    public.lead_packages lp
  WHERE
    lp.id = p_package_id
    AND lp.active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package not available';
  END IF;

  v_leads_needed := v_package.leads_count * p_quantity;

  FOR v_rec IN
  SELECT
    l.*
  FROM
    public.leads l
  WHERE
    l.category_id = v_package.category_id
    AND l.sold_at IS NULL
  ORDER BY
    l.created_at ASC
  LIMIT v_leads_needed
  FOR UPDATE OF l SKIP LOCKED
    LOOP
      SELECT
        t.amount_cents INTO v_line_amt
      FROM
        public._deliver_one_inventory_lead_prepaid (v_org_id, v_rec.id, 'Lead flow (prepaid delivery)') AS t;
      v_total := v_total + v_line_amt;
      v_n := v_n + 1;
    END LOOP;

  IF v_n < v_leads_needed THEN
    RAISE EXCEPTION 'Not enough leads available for this package';
  END IF;

  purchase_id := NULL;
  total_amount_cents := v_total;
  leads_allocated := v_n;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.customer_purchase_package_for_org (uuid, uuid, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_purchase_package_for_org (uuid, uuid, integer, uuid) TO service_role;
