-- Admin deploy features:
-- 1) Single Debt Review category
-- 2) Per-organization pricing overrides
-- 3) Per-organization free test lead quotas with automatic proportional distribution

-- ---------------------------------------------------------------------------
-- 1. Consolidate to Debt Review category only
-- ---------------------------------------------------------------------------
INSERT INTO public.categories (name, slug)
VALUES ('Debt Review', 'debt-review')
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name;

DO $$
DECLARE
  v_debt_id uuid;
  v_debt_relief_id uuid;
  v_other_id uuid;
BEGIN
  SELECT id INTO v_debt_id
  FROM public.categories
  WHERE slug = 'debt-review'
  LIMIT 1;

  IF v_debt_id IS NULL THEN
    RAISE EXCEPTION 'Debt Review category missing after seed';
  END IF;

  SELECT id INTO v_debt_relief_id
  FROM public.categories
  WHERE slug = 'debt-relief'
    AND id <> v_debt_id
  LIMIT 1;

  -- If legacy debt-relief exists, move its data onto debt-review before removal.
  IF v_debt_relief_id IS NOT NULL THEN
    UPDATE public.leads
    SET category_id = v_debt_id
    WHERE category_id = v_debt_relief_id;

    UPDATE public.lead_packages
    SET category_id = v_debt_id
    WHERE category_id = v_debt_relief_id;

    -- Pricebook has UNIQUE (category_id, unit_type): merge only missing unit types.
    INSERT INTO public.lead_pricebook (category_id, unit_type, price_cents, label, active)
    SELECT
      v_debt_id,
      lp.unit_type,
      lp.price_cents,
      lp.label,
      lp.active
    FROM public.lead_pricebook lp
    WHERE lp.category_id = v_debt_relief_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.lead_pricebook existing
        WHERE existing.category_id = v_debt_id
          AND existing.unit_type = lp.unit_type
      );

    DELETE FROM public.lead_pricebook
    WHERE category_id = v_debt_relief_id;

    -- Tier ranges cannot overlap within a category: keep debt-review tiers when present.
    IF NOT EXISTS (
      SELECT 1 FROM public.category_pricing_tiers WHERE category_id = v_debt_id
    ) THEN
      UPDATE public.category_pricing_tiers
      SET category_id = v_debt_id
      WHERE category_id = v_debt_relief_id;
    ELSE
      DELETE FROM public.category_pricing_tiers
      WHERE category_id = v_debt_relief_id;
    END IF;

    UPDATE public.customer_leads
    SET category_id = v_debt_id
    WHERE category_id = v_debt_relief_id;

    UPDATE public.delivery_routing_events
    SET category_id = v_debt_id
    WHERE category_id = v_debt_relief_id;

    UPDATE public.routing_job_runs
    SET category_id = v_debt_id
    WHERE category_id = v_debt_relief_id;

    DELETE FROM public.categories WHERE id = v_debt_relief_id;
  END IF;

  -- Reassign remaining non-debt categories, then drop their pricing rows (do not merge tiers).
  UPDATE public.leads
  SET category_id = v_debt_id
  WHERE category_id <> v_debt_id;

  UPDATE public.lead_packages
  SET category_id = v_debt_id
  WHERE category_id <> v_debt_id;

  DELETE FROM public.lead_pricebook
  WHERE category_id <> v_debt_id;

  DELETE FROM public.category_pricing_tiers
  WHERE category_id <> v_debt_id;

  UPDATE public.customer_leads
  SET category_id = v_debt_id
  WHERE category_id <> v_debt_id;

  UPDATE public.customer_lead_flows clf
  SET package_id = (
    SELECT lp.id
    FROM public.lead_packages lp
    WHERE lp.category_id = v_debt_id
      AND lp.active = TRUE
    ORDER BY lp.created_at ASC
    LIMIT 1
  )
  WHERE EXISTS (
    SELECT 1
    FROM public.lead_packages lp2
    WHERE lp2.id = clf.package_id
      AND lp2.category_id <> v_debt_id
  );

  UPDATE public.delivery_routing_events SET category_id = v_debt_id
  WHERE category_id <> v_debt_id;

  UPDATE public.routing_job_runs SET category_id = v_debt_id
  WHERE category_id IS NOT NULL
    AND category_id <> v_debt_id;

  FOR v_other_id IN
    SELECT id FROM public.categories WHERE id <> v_debt_id
  LOOP
    DELETE FROM public.categories WHERE id = v_other_id;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Per-organization pricing overrides (flat per-lead CPL by unit type)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_pricing_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories (id) ON DELETE CASCADE,
  unit_type public.lead_unit_type NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  active boolean NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, category_id, unit_type)
);

CREATE INDEX IF NOT EXISTS idx_org_pricing_overrides_org
  ON public.organization_pricing_overrides (organization_id);

DROP TRIGGER IF EXISTS organization_pricing_overrides_updated_at ON public.organization_pricing_overrides;
CREATE TRIGGER organization_pricing_overrides_updated_at
  BEFORE UPDATE ON public.organization_pricing_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

ALTER TABLE public.organization_pricing_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_pricing_overrides_staff_all ON public.organization_pricing_overrides;
CREATE POLICY organization_pricing_overrides_staff_all ON public.organization_pricing_overrides
  FOR ALL TO authenticated
  USING (public.is_staff ())
  WITH CHECK (public.is_staff ());

DROP POLICY IF EXISTS organization_pricing_overrides_org_select ON public.organization_pricing_overrides;
CREATE POLICY organization_pricing_overrides_org_select ON public.organization_pricing_overrides
  FOR SELECT TO authenticated
  USING (organization_id = public.user_org_id ());

CREATE OR REPLACE FUNCTION public.resolve_lead_price_cents (
  p_organization_id uuid,
  p_category_id uuid,
  p_unit_type public.lead_unit_type)
  RETURNS integer
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
  SELECT COALESCE(
    (
      SELECT o.price_cents
      FROM public.organization_pricing_overrides o
      WHERE o.organization_id = p_organization_id
        AND o.category_id = p_category_id
        AND o.unit_type = p_unit_type
        AND o.active = TRUE
      LIMIT 1
    ),
    (
      SELECT lp.price_cents
      FROM public.lead_pricebook lp
      WHERE lp.category_id = p_category_id
        AND lp.unit_type = p_unit_type
        AND lp.active = TRUE
      LIMIT 1
    )
  );
$$;

REVOKE ALL ON FUNCTION public.resolve_lead_price_cents (uuid, uuid, public.lead_unit_type) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_lead_price_cents (uuid, uuid, public.lead_unit_type) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Free test lead quotas per organization
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_free_test_allocations (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  quota_total integer NOT NULL CHECK (quota_total > 0),
  quota_delivered integer NOT NULL DEFAULT 0 CHECK (quota_delivered >= 0),
  is_active boolean NOT NULL DEFAULT FALSE,
  activated_at timestamptz,
  activated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (quota_delivered <= quota_total)
);

DROP TRIGGER IF EXISTS organization_free_test_allocations_updated_at ON public.organization_free_test_allocations;
CREATE TRIGGER organization_free_test_allocations_updated_at
  BEFORE UPDATE ON public.organization_free_test_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

ALTER TABLE public.organization_free_test_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_free_test_allocations_staff_all ON public.organization_free_test_allocations;
CREATE POLICY organization_free_test_allocations_staff_all ON public.organization_free_test_allocations
  FOR ALL TO authenticated
  USING (public.is_staff ())
  WITH CHECK (public.is_staff ());

DROP POLICY IF EXISTS organization_free_test_allocations_org_select ON public.organization_free_test_allocations;
CREATE POLICY organization_free_test_allocations_org_select ON public.organization_free_test_allocations
  FOR SELECT TO authenticated
  USING (organization_id = public.user_org_id ());

-- Allow free_test grant source alongside paid and signup_free.
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
      AND grant_source IN ('signup_free', 'free_test')
    )
  );

DROP INDEX IF EXISTS public.idx_customer_leads_one_signup_free_per_org;

CREATE OR REPLACE FUNCTION public.deliver_free_test_lead (
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
  v_alloc public.organization_free_test_allocations%ROWTYPE;
  v_cl_id uuid;
  v_assignee uuid;
BEGIN
  SELECT
    a.* INTO v_alloc
  FROM
    public.organization_free_test_allocations a
  WHERE
    a.organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND OR v_alloc.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Free test leads are not active for this organization';
  END IF;
  IF v_alloc.quota_delivered >= v_alloc.quota_total THEN
    RAISE EXCEPTION 'Free test lead quota exhausted';
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
    v_lead.lead_unit_type,
    0,
    NULL,
    'free_test',
    v_assignee)
RETURNING
  id INTO v_cl_id;

  UPDATE
    public.organization_free_test_allocations
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
    'free_test'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.deliver_free_test_lead (uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deliver_free_test_lead (uuid, uuid) TO service_role;

-- Distribute unsold inventory proportionally across active free-test orgs.
CREATE OR REPLACE FUNCTION public.distribute_free_test_leads (
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
BEGIN
  LOOP
    SELECT
      COALESCE(SUM(GREATEST(a.quota_total - a.quota_delivered, 0)), 0) INTO v_remaining_total
    FROM
      public.organization_free_test_allocations a
    WHERE
      a.is_active = TRUE
      AND a.quota_delivered < a.quota_total;

    EXIT WHEN v_remaining_total <= 0;

    SELECT
      l.id INTO v_lead_id
    FROM
      public.leads l
    WHERE
      l.sold_at IS NULL
      AND (p_category_id IS NULL OR l.category_id = p_category_id)
    ORDER BY
      l.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    EXIT WHEN v_lead_id IS NULL;

    SELECT
      a.organization_id INTO v_org_id
    FROM
      public.organization_free_test_allocations a
    WHERE
      a.is_active = TRUE
      AND a.quota_delivered < a.quota_total
    ORDER BY
      (a.quota_delivered::numeric / a.quota_total::numeric) ASC,
      a.activated_at ASC NULLS LAST,
      a.organization_id ASC
    LIMIT 1;

    IF v_org_id IS NULL THEN
      EXIT;
    END IF;

    PERFORM
      public.deliver_free_test_lead(v_org_id, v_lead_id);
    v_delivered := v_delivered + 1;
  END LOOP;

  RETURN v_delivered;
END;
$$;

REVOKE ALL ON FUNCTION public.distribute_free_test_leads (uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.distribute_free_test_leads (uuid) TO service_role;

-- Use org pricing overrides in prepaid delivery when available.
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

  v_price := public.resolve_lead_price_cents(
    p_organization_id,
    v_lead.category_id,
    v_lead.lead_unit_type
  );
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
