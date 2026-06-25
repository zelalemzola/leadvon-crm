-- Free delivery: single total quota only (no per-day pace). Deliver fairly as inventory
-- arrives until quota_total is reached, then auto-disable.
-- Idempotent: safe if prior migrations were only partially applied.

ALTER TABLE public.organization_free_delivery
  ADD COLUMN IF NOT EXISTS quota_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quota_delivered integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organization_free_delivery'
      AND column_name = 'leads_per_day'
  ) THEN
    EXECUTE $sql$
      UPDATE public.organization_free_delivery
      SET quota_total = GREATEST(quota_total, leads_per_day, quota_delivered, 1)
      WHERE quota_total = 0 AND leads_per_day > 0
    $sql$;
  END IF;
END $$;

UPDATE
  public.organization_free_delivery d
SET
  quota_delivered = GREATEST(d.quota_delivered, COALESCE(stats.cnt, 0))
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

-- Ensure quota_total is at least what was already delivered (and any legacy per-day value).
UPDATE
  public.organization_free_delivery d
SET
  quota_total = GREATEST(
    d.quota_total,
    d.quota_delivered,
    COALESCE(d.leads_per_day, 0),
    CASE WHEN d.quota_delivered > 0 OR d.is_active THEN 1 ELSE 0 END
  )
WHERE
  d.quota_total < d.quota_delivered
  OR (d.quota_total = 0 AND (d.quota_delivered > 0 OR d.is_active = TRUE));

DROP FUNCTION IF EXISTS public.accrue_free_delivery_obligations (uuid);
DROP FUNCTION IF EXISTS public.free_delivery_delivered_today (uuid);

ALTER TABLE public.organization_free_delivery
  DROP CONSTRAINT IF EXISTS organization_free_delivery_campaign_check;

ALTER TABLE public.organization_free_delivery
  DROP CONSTRAINT IF EXISTS organization_free_delivery_leads_per_day_check;

ALTER TABLE public.organization_free_delivery
  DROP COLUMN IF EXISTS leads_per_day,
  DROP COLUMN IF EXISTS pending_delivery_leads,
  DROP COLUMN IF EXISTS last_obligation_date;

ALTER TABLE public.organization_free_delivery
  ADD CONSTRAINT organization_free_delivery_campaign_check CHECK (
    quota_total >= 0
    AND quota_delivered >= 0
    AND quota_delivered <= quota_total
  );

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
BEGIN
  LOOP
    SELECT
      COALESCE(SUM(GREATEST(d.quota_total - d.quota_delivered, 0)), 0) INTO v_remaining_total
    FROM
      public.organization_free_delivery d
    WHERE
      d.is_active = TRUE
      AND d.quota_total > 0
      AND d.quota_delivered < d.quota_total;

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
      d.organization_id INTO v_org_id
    FROM
      public.organization_free_delivery d
    WHERE
      d.is_active = TRUE
      AND d.quota_total > 0
      AND d.quota_delivered < d.quota_total
    ORDER BY
      (d.quota_delivered::numeric / d.quota_total::numeric) ASC,
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
