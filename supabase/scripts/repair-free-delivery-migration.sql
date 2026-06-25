-- Run this in Supabase SQL Editor if 20260625120000 failed partway through.
-- Safe to re-run: uses IF EXISTS / ON CONFLICT where needed.

-- 1) Allow free_delivery in the check constraint before renaming rows.
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
      AND grant_source IN ('signup_free', 'free_test', 'free_delivery')
    )
  );

UPDATE public.customer_leads
SET grant_source = 'free_delivery'
WHERE grant_source = 'free_test';

-- 2) Finish schema swap if not already applied.
CREATE TABLE IF NOT EXISTS public.organization_free_delivery (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT FALSE,
  activated_at timestamptz,
  activated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF to_regclass('public.organization_free_test_allocations') IS NOT NULL THEN
    INSERT INTO public.organization_free_delivery (
      organization_id,
      is_active,
      activated_at,
      activated_by,
      created_at,
      updated_at)
    SELECT
      a.organization_id,
      a.is_active,
      a.activated_at,
      a.activated_by,
      a.created_at,
      a.updated_at
    FROM public.organization_free_test_allocations a
    ON CONFLICT (organization_id) DO UPDATE SET
      is_active = EXCLUDED.is_active,
      activated_at = COALESCE(public.organization_free_delivery.activated_at, EXCLUDED.activated_at),
      activated_by = COALESCE(public.organization_free_delivery.activated_by, EXCLUDED.activated_by),
      updated_at = now();

    DROP TRIGGER IF EXISTS organization_free_test_allocations_updated_at ON public.organization_free_test_allocations;
    DROP TABLE public.organization_free_test_allocations;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.distribute_free_test_leads (uuid);
DROP FUNCTION IF EXISTS public.deliver_free_test_lead (uuid, uuid);

DROP TRIGGER IF EXISTS organization_free_delivery_updated_at ON public.organization_free_delivery;
CREATE TRIGGER organization_free_delivery_updated_at
  BEFORE UPDATE ON public.organization_free_delivery
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

ALTER TABLE public.organization_free_delivery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_free_delivery_staff_all ON public.organization_free_delivery;
CREATE POLICY organization_free_delivery_staff_all ON public.organization_free_delivery
  FOR ALL TO authenticated
  USING (public.is_staff ())
  WITH CHECK (public.is_staff ());

DROP POLICY IF EXISTS organization_free_delivery_org_select ON public.organization_free_delivery;
CREATE POLICY organization_free_delivery_org_select ON public.organization_free_delivery
  FOR SELECT TO authenticated
  USING (organization_id = public.user_org_id ());

-- 3) Tighten constraint (free_test no longer used).
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
      AND grant_source IN ('signup_free', 'free_delivery')
    )
  );

-- 4) RPC functions for free delivery routing.
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

REVOKE ALL ON FUNCTION public.deliver_free_delivery_lead (uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deliver_free_delivery_lead (uuid, uuid) TO service_role;

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
  v_active_orgs integer;
BEGIN
  SELECT
    count(*)::integer INTO v_active_orgs
  FROM
    public.organization_free_delivery d
  WHERE
    d.is_active = TRUE;

  IF v_active_orgs <= 0 THEN
    RETURN 0;
  END IF;

  LOOP
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
      pick.organization_id INTO v_org_id
    FROM (
      SELECT
        d.organization_id,
        COALESCE(stats.delivered_count, 0) AS delivered_count,
        d.activated_at
      FROM
        public.organization_free_delivery d
        LEFT JOIN (
          SELECT
            cl.organization_id,
            count(*)::integer AS delivered_count
          FROM
            public.customer_leads cl
          WHERE
            cl.grant_source = 'free_delivery'
          GROUP BY
            cl.organization_id) stats ON stats.organization_id = d.organization_id
      WHERE
        d.is_active = TRUE) pick
    ORDER BY
      pick.delivered_count ASC,
      pick.activated_at ASC NULLS LAST,
      pick.organization_id ASC
    LIMIT 1;

    IF v_org_id IS NULL THEN
      EXIT;
    END IF;

    PERFORM
      public.deliver_free_delivery_lead(v_org_id, v_lead_id);
    v_delivered := v_delivered + 1;
  END LOOP;

  RETURN v_delivered;
END;
$$;

REVOKE ALL ON FUNCTION public.distribute_free_delivery_leads (uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.distribute_free_delivery_leads (uuid) TO service_role;
