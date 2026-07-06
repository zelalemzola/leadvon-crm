-- Promote review_status from summary text to a first-class column, and add per-org
-- free-delivery filters for category, source, and review_status.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS review_status text;

ALTER TABLE public.customer_leads
  ADD COLUMN IF NOT EXISTS review_status text;

CREATE INDEX IF NOT EXISTS idx_leads_review_status ON public.leads (review_status)
WHERE review_status IS NOT NULL;

-- Backfill Base44 leads from source_payload.
UPDATE public.leads l
SET review_status = lower(trim(l.source_payload ->> 'review_status'))
WHERE l.review_status IS NULL
  AND COALESCE(l.source_payload ->> 'review_status', '') <> '';

-- Remove review_status segment from summary for rows we backfilled.
UPDATE public.leads
SET summary = NULLIF(
  trim(
    both ' -'
    FROM regexp_replace(summary, '(^|\s*-\s*)review_status:\s*[^-]+', '', 'gi')
  ),
  ''
)
WHERE review_status IS NOT NULL
  AND summary ILIKE '%review_status:%';

ALTER TABLE public.organization_free_delivery
  ADD COLUMN IF NOT EXISTS allowed_category_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS allowed_source_systems text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS allowed_review_statuses text[] NOT NULL DEFAULT '{}'::text[];

CREATE OR REPLACE FUNCTION public.lead_matches_org_free_delivery_filters (
  p_lead_category_id uuid,
  p_lead_source_system text,
  p_lead_review_status text,
  p_allowed_category_ids uuid[],
  p_allowed_source_systems text[],
  p_allowed_review_statuses text[])
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  AS $$
  SELECT
    (p_allowed_category_ids IS NULL
      OR cardinality(p_allowed_category_ids) = 0
      OR p_lead_category_id = ANY (p_allowed_category_ids))
    AND (p_allowed_source_systems IS NULL
      OR cardinality(p_allowed_source_systems) = 0
      OR COALESCE(p_lead_source_system, 'manual') = ANY (p_allowed_source_systems))
    AND (p_allowed_review_statuses IS NULL
      OR cardinality(p_allowed_review_statuses) = 0
      OR (p_lead_review_status IS NOT NULL
        AND p_lead_review_status = ANY (p_allowed_review_statuses)));
$$;

CREATE OR REPLACE FUNCTION public.deliver_free_delivery_lead (
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
  v_delivery public.organization_free_delivery%ROWTYPE;
  v_cl_id uuid;
  v_assignee uuid;
BEGIN
  SELECT
    d.* INTO v_delivery
  FROM
    public.organization_free_delivery d
  WHERE
    d.organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND OR v_delivery.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Free leads delivery is not active for this organization';
  END IF;
  IF now() < v_delivery.distribute_after THEN
    RAISE EXCEPTION 'Free delivery grace period has not elapsed';
  END IF;
  IF v_delivery.quota_total <= 0 THEN
    RAISE EXCEPTION 'Free delivery total is not configured for this organization';
  END IF;
  IF v_delivery.quota_delivered >= v_delivery.quota_total THEN
    RAISE EXCEPTION 'Free delivery quota is complete';
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
  IF v_lead.created_at < v_delivery.eligible_from THEN
    RAISE EXCEPTION 'Lead is not eligible for this free delivery campaign';
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
    review_status,
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
    v_lead.review_status,
    v_lead.country,
    v_lead.lead_unit_type,
    0,
    NULL,
    'free_delivery',
    v_assignee)
RETURNING
  id INTO v_cl_id;

  UPDATE
    public.organization_free_delivery
  SET
    quota_delivered = quota_delivered + 1,
    is_active = CASE
      WHEN quota_delivered + 1 >= quota_total THEN FALSE
      ELSE is_active
    END
  WHERE
    organization_id = p_organization_id;

  RETURN QUERY
  SELECT
    v_cl_id,
    'free_delivery'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.distribute_free_delivery_leads (
  p_category_id uuid DEFAULT NULL)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  v_delivered integer := 0;
  v_lead_id uuid;
  v_org_id uuid;
  v_remaining_total integer;
  v_eligible_from timestamptz;
  v_allowed_category_ids uuid[];
  v_allowed_source_systems text[];
  v_allowed_review_statuses text[];
BEGIN
  IF EXISTS (
    SELECT
      1
    FROM
      public.organization_free_delivery d
    WHERE
      d.is_active = TRUE
      AND d.quota_total > 0
      AND d.quota_delivered < d.quota_total
      AND d.distribute_after > now()) THEN
    RETURN 0;
  END IF;

  LOOP
    SELECT
      COALESCE(SUM(GREATEST(d.quota_total - d.quota_delivered, 0)), 0) INTO v_remaining_total
    FROM
      public.organization_free_delivery d
    WHERE
      d.is_active = TRUE
      AND d.quota_total > 0
      AND d.quota_delivered < d.quota_total
      AND d.distribute_after <= now();

    EXIT WHEN v_remaining_total <= 0;

    SELECT
      d.organization_id,
      d.eligible_from,
      d.allowed_category_ids,
      d.allowed_source_systems,
      d.allowed_review_statuses INTO v_org_id,
      v_eligible_from,
      v_allowed_category_ids,
      v_allowed_source_systems,
      v_allowed_review_statuses
    FROM
      public.organization_free_delivery d
    WHERE
      d.is_active = TRUE
      AND d.quota_total > 0
      AND d.quota_delivered < d.quota_total
      AND d.distribute_after <= now()
      AND EXISTS (
        SELECT
          1
        FROM
          public.leads l
        WHERE
          l.sold_at IS NULL
          AND (p_category_id IS NULL
            OR l.category_id = p_category_id)
          AND l.created_at >= d.eligible_from
          AND public.lead_matches_org_free_delivery_filters (
            l.category_id,
            l.source_system,
            l.review_status,
            d.allowed_category_ids,
            d.allowed_source_systems,
            d.allowed_review_statuses))
    ORDER BY
      (d.quota_delivered::numeric / d.quota_total::numeric) ASC,
      d.activated_at ASC NULLS LAST,
      d.organization_id ASC
    LIMIT 1;

    IF v_org_id IS NULL THEN
      EXIT;
    END IF;

    SELECT
      l.id INTO v_lead_id
    FROM
      public.leads l
    WHERE
      l.sold_at IS NULL
      AND (p_category_id IS NULL
        OR l.category_id = p_category_id)
      AND l.created_at >= v_eligible_from
      AND public.lead_matches_org_free_delivery_filters (
        l.category_id,
        l.source_system,
        l.review_status,
        v_allowed_category_ids,
        v_allowed_source_systems,
        v_allowed_review_statuses)
    ORDER BY
      l.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    EXIT WHEN v_lead_id IS NULL;

    PERFORM
      public.deliver_free_delivery_lead (v_org_id, v_lead_id);
    v_delivered := v_delivered + 1;
  END LOOP;

  RETURN v_delivered;
END;
$$;

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
    review_status,
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
    v_lead.review_status,
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
  v_assignee uuid;
BEGIN
  PERFORM 1
  FROM public.organizations o
  WHERE o.id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  IF EXISTS (
    SELECT
      1
    FROM
      public.customer_leads cl
    WHERE
      cl.organization_id = p_organization_id) THEN
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
    review_status,
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
    v_lead.review_status,
    v_lead.lead_unit_type,
    0,
    NULL,
    'signup_free',
    v_assignee)
RETURNING
  id INTO v_cl_id;

  RETURN QUERY
  SELECT
    v_cl_id,
    'signup_free'::text;
END;
$$;

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
  v_assignee uuid;
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
  v_assignee := public.pick_weighted_assignee(p_organization_id);

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
  FOR UPDATE OF e LOOP
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

  IF v_need > 0 OR v_primary IS NULL THEN
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
    review_status,
    country,
    lead_unit_type,
    charged_amount_cents,
    entitlement_id,
    assigned_to)
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
    v_lead.review_status,
    v_lead.country,
    v_lead.lead_unit_type,
    v_price::integer,
    v_primary,
    v_assignee)
RETURNING
  id INTO v_cl_id;

  FOR i IN 1..array_length(v_ent_ids, 1) LOOP
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

  RETURN QUERY
  SELECT
    v_cl_id,
    v_primary,
    v_price,
    v_bals[1];
END;
$$;

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

  v_price := public.resolve_lead_price_cents(p_organization_id, v_lead.category_id, v_lead.lead_unit_type);
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
    review_status,
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
    v_lead.review_status,
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
