-- Free leads delivery: quota_total becomes leads_per_day (daily cap, resets each UTC day).
-- Drop lifetime quota_delivered counter; today's count comes from customer_leads.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organization_free_delivery'
      AND column_name = 'quota_total'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organization_free_delivery'
      AND column_name = 'leads_per_day'
  ) THEN
    ALTER TABLE public.organization_free_delivery
      RENAME COLUMN quota_total TO leads_per_day;
  END IF;
END $$;

ALTER TABLE public.organization_free_delivery
  ADD COLUMN IF NOT EXISTS leads_per_day integer NOT NULL DEFAULT 0;

ALTER TABLE public.organization_free_delivery
  DROP CONSTRAINT IF EXISTS organization_free_delivery_quota_range;

ALTER TABLE public.organization_free_delivery
  DROP COLUMN IF EXISTS quota_delivered;

ALTER TABLE public.organization_free_delivery
  DROP CONSTRAINT IF EXISTS organization_free_delivery_leads_per_day_check;

ALTER TABLE public.organization_free_delivery
  ADD CONSTRAINT organization_free_delivery_leads_per_day_check CHECK (leads_per_day >= 0);

CREATE OR REPLACE FUNCTION public.free_delivery_delivered_today (
  p_organization_id uuid)
  RETURNS integer
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
  SELECT
    count(*)::integer
  FROM
    public.customer_leads cl
  WHERE
    cl.organization_id = p_organization_id
    AND cl.grant_source = 'free_delivery'
    AND (cl.created_at AT TIME ZONE 'UTC')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;
$$;

REVOKE ALL ON FUNCTION public.free_delivery_delivered_today (uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.free_delivery_delivered_today (uuid) TO service_role;

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
  v_delivered_today integer;
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
  IF v_delivery.leads_per_day <= 0 THEN
    RAISE EXCEPTION 'Free delivery daily quota is not configured for this organization';
  END IF;

  v_delivered_today := public.free_delivery_delivered_today(p_organization_id);
  IF v_delivered_today >= v_delivery.leads_per_day THEN
    RAISE EXCEPTION 'Free delivery daily quota reached for today';
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
  v_remaining_today integer;
  v_today date := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;
BEGIN
  LOOP
    SELECT
      COALESCE(SUM(GREATEST(d.leads_per_day - COALESCE(stats.delivered_today, 0), 0)), 0) INTO v_remaining_today
    FROM
      public.organization_free_delivery d
      LEFT JOIN (
        SELECT
          cl.organization_id,
          count(*)::integer AS delivered_today
        FROM
          public.customer_leads cl
        WHERE
          cl.grant_source = 'free_delivery'
          AND (cl.created_at AT TIME ZONE 'UTC')::date = v_today
        GROUP BY
          cl.organization_id) stats ON stats.organization_id = d.organization_id
    WHERE
      d.is_active = TRUE
      AND d.leads_per_day > 0
      AND COALESCE(stats.delivered_today, 0) < d.leads_per_day;

    EXIT WHEN v_remaining_today <= 0;

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
        d.leads_per_day,
        d.activated_at,
        COALESCE(stats.delivered_today, 0) AS delivered_today
      FROM
        public.organization_free_delivery d
        LEFT JOIN (
          SELECT
            cl.organization_id,
            count(*)::integer AS delivered_today
          FROM
            public.customer_leads cl
          WHERE
            cl.grant_source = 'free_delivery'
            AND (cl.created_at AT TIME ZONE 'UTC')::date = v_today
          GROUP BY
            cl.organization_id) stats ON stats.organization_id = d.organization_id
      WHERE
        d.is_active = TRUE
        AND d.leads_per_day > 0
        AND COALESCE(stats.delivered_today, 0) < d.leads_per_day) pick
    ORDER BY
      (pick.delivered_today::numeric / pick.leads_per_day::numeric) ASC,
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
