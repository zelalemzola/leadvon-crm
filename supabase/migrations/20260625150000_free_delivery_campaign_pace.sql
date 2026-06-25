-- Campaign-style free delivery: total quota with daily pace, carryover pending, auto-disable at completion.

ALTER TABLE public.organization_free_delivery
  ADD COLUMN IF NOT EXISTS quota_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quota_delivered integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_delivery_leads integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_obligation_date date;

UPDATE
  public.organization_free_delivery d
SET
  quota_delivered = COALESCE(stats.cnt, 0)
FROM (
  SELECT
    cl.organization_id,
    count(*)::integer AS cnt
  FROM
    public.customer_leads cl
  WHERE
    cl.grant_source = 'free_delivery'
  GROUP BY
    cl.organization_id) stats
WHERE
  stats.organization_id = d.organization_id;

UPDATE
  public.organization_free_delivery
SET
  quota_total = GREATEST(leads_per_day, quota_delivered, 1)
WHERE
  quota_total = 0
  AND leads_per_day > 0;

ALTER TABLE public.organization_free_delivery
  DROP CONSTRAINT IF EXISTS organization_free_delivery_leads_per_day_check;

ALTER TABLE public.organization_free_delivery
  DROP CONSTRAINT IF EXISTS organization_free_delivery_campaign_check;

ALTER TABLE public.organization_free_delivery
  ADD CONSTRAINT organization_free_delivery_campaign_check CHECK (
    quota_total >= 0
    AND quota_delivered >= 0
    AND pending_delivery_leads >= 0
    AND leads_per_day >= 0
    AND quota_delivered <= quota_total
    AND pending_delivery_leads <= GREATEST(quota_total - quota_delivered, 0)
  );

DROP FUNCTION IF EXISTS public.free_delivery_delivered_today (uuid);

CREATE OR REPLACE FUNCTION public.accrue_free_delivery_obligations (
  p_organization_id uuid DEFAULT NULL)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  v_today date := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;
  v_accrued integer := 0;
  r record;
  v_add integer;
BEGIN
  FOR r IN
  SELECT
    d.organization_id,
    d.quota_total,
    d.quota_delivered,
    d.pending_delivery_leads,
    d.leads_per_day
  FROM
    public.organization_free_delivery d
  WHERE
    d.is_active = TRUE
    AND d.quota_total > 0
    AND d.leads_per_day > 0
    AND d.quota_delivered < d.quota_total
    AND (d.last_obligation_date IS NULL OR d.last_obligation_date < v_today)
    AND (p_organization_id IS NULL OR d.organization_id = p_organization_id)
  FOR UPDATE OF d LOOP
    v_add := LEAST(
      r.leads_per_day,
      GREATEST(r.quota_total - r.quota_delivered - r.pending_delivery_leads, 0));
    IF v_add <= 0 THEN
      UPDATE
        public.organization_free_delivery
      SET
        last_obligation_date = v_today
      WHERE
        organization_id = r.organization_id;
      CONTINUE;
    END IF;
    UPDATE
      public.organization_free_delivery
    SET
      pending_delivery_leads = pending_delivery_leads + v_add,
      last_obligation_date = v_today
    WHERE
      organization_id = r.organization_id;
    v_accrued := v_accrued + v_add;
  END LOOP;
  RETURN v_accrued;
END;
$$;

REVOKE ALL ON FUNCTION public.accrue_free_delivery_obligations (uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accrue_free_delivery_obligations (uuid) TO service_role;

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
  IF v_delivery.quota_total <= 0 OR v_delivery.leads_per_day <= 0 THEN
    RAISE EXCEPTION 'Free delivery campaign is not configured for this organization';
  END IF;
  IF v_delivery.quota_delivered >= v_delivery.quota_total THEN
    RAISE EXCEPTION 'Free delivery campaign quota is complete';
  END IF;
  IF v_delivery.pending_delivery_leads <= 0 THEN
    RAISE EXCEPTION 'No pending free delivery obligation for this organization';
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

  UPDATE
    public.organization_free_delivery
  SET
    quota_delivered = quota_delivered + 1,
    pending_delivery_leads = GREATEST(pending_delivery_leads - 1, 0),
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
  v_pending_total integer;
BEGIN
  PERFORM
    public.accrue_free_delivery_obligations(NULL);

  LOOP
    SELECT
      COALESCE(SUM(d.pending_delivery_leads), 0) INTO v_pending_total
    FROM
      public.organization_free_delivery d
    WHERE
      d.is_active = TRUE
      AND d.pending_delivery_leads > 0
      AND d.quota_delivered < d.quota_total;

    EXIT WHEN v_pending_total <= 0;

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
      d.organization_id INTO v_org_id
    FROM
      public.organization_free_delivery d
    WHERE
      d.is_active = TRUE
      AND d.pending_delivery_leads > 0
      AND d.quota_delivered < d.quota_total
    ORDER BY
      (d.quota_delivered::numeric / NULLIF(d.quota_total, 0)) ASC,
      d.activated_at ASC NULLS LAST,
      d.organization_id ASC
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
