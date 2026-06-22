-- Lead assignment percentages on agents + weighted auto-assignment on delivery.
-- In-app notifications + email queue for new leads.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lead_assignment_percentage integer NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_lead_assignment_percentage_range;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_lead_assignment_percentage_range
  CHECK (lead_assignment_percentage >= 0 AND lead_assignment_percentage <= 100);

CREATE OR REPLACE FUNCTION public.pick_weighted_assignee (p_organization_id uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  v_assignee uuid;
  v_total numeric;
  v_pick numeric;
BEGIN
  SELECT
    COALESCE(SUM(lead_assignment_percentage), 0) INTO v_total
  FROM
    public.profiles
  WHERE
    organization_id = p_organization_id
    AND role = 'customer_agent'
    AND is_active = TRUE
    AND lead_assignment_percentage > 0;

  IF v_total <= 0 THEN
    RETURN NULL;
  END IF;

  v_pick := random() * v_total;

  SELECT
    ranked.id INTO v_assignee
  FROM (
    SELECT
      p.id,
      SUM(p.lead_assignment_percentage) OVER (ORDER BY p.id) - p.lead_assignment_percentage AS low_bound,
      SUM(p.lead_assignment_percentage) OVER (ORDER BY p.id) AS high_bound
    FROM
      public.profiles p
    WHERE
      p.organization_id = p_organization_id
      AND p.role = 'customer_agent'
      AND p.is_active = TRUE
      AND p.lead_assignment_percentage > 0) ranked
WHERE
  v_pick >= ranked.low_bound
  AND v_pick < ranked.high_bound
ORDER BY
  ranked.id
LIMIT 1;

  RETURN v_assignee;
END;
$$;

REVOKE ALL ON FUNCTION public.pick_weighted_assignee (uuid) FROM PUBLIC;

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
    v_lead.country,
    v_lead.lead_unit_type,
    v_price::integer,
    v_primary,
    v_assignee)
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

CREATE TABLE IF NOT EXISTS public.customer_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  email_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_notifications_recipient_created
  ON public.customer_notifications (recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_notifications_email_pending
  ON public.customer_notifications (created_at)
  WHERE email_sent_at IS NULL AND type = 'lead_received';

ALTER TABLE public.customer_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_notifications_select_own ON public.customer_notifications;
CREATE POLICY customer_notifications_select_own ON public.customer_notifications
  FOR SELECT
  USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS customer_notifications_update_own ON public.customer_notifications;
CREATE POLICY customer_notifications_update_own ON public.customer_notifications
  FOR UPDATE
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_on_customer_lead_insert ()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  v_lead_name text;
  v_category_name text;
  v_admin record;
BEGIN
  v_lead_name := trim(concat_ws(' ', NEW.first_name, NEW.last_name));
  IF v_lead_name = '' THEN
    v_lead_name := 'New lead';
  END IF;

  SELECT
    c.name INTO v_category_name
  FROM
    public.categories c
  WHERE
    c.id = NEW.category_id;

  FOR v_admin IN
  SELECT
    p.id,
    p.email
  FROM
    public.profiles p
  WHERE
    p.organization_id = NEW.organization_id
    AND p.role = 'customer_admin'
    AND p.is_active = TRUE
    LOOP
      INSERT INTO public.customer_notifications (
        organization_id,
        recipient_id,
        type,
        title,
        body,
        entity_type,
        entity_id,
        metadata)
      VALUES (
        NEW.organization_id,
        v_admin.id,
        'lead_received',
        'New lead received',
        v_lead_name || ' was added to your pipeline.',
        'customer_lead',
        NEW.id,
        jsonb_build_object(
          'lead_name', v_lead_name,
          'category_name', COALESCE(v_category_name, ''),
          'status', NEW.status,
          'phone', NEW.phone,
          'country', COALESCE(NEW.country, ''),
          'zip_code', COALESCE(NEW.zip_code, '')));
    END LOOP;

  IF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.customer_notifications (
      organization_id,
      recipient_id,
      type,
      title,
      body,
      entity_type,
      entity_id,
      metadata)
    VALUES (
      NEW.organization_id,
      NEW.assigned_to,
      'lead_assigned',
      'Lead assigned to you',
      v_lead_name || ' has been assigned to you.',
      'customer_lead',
      NEW.id,
      jsonb_build_object(
        'lead_name', v_lead_name,
        'category_name', COALESCE(v_category_name, ''),
        'status', NEW.status,
        'phone', NEW.phone,
        'country', COALESCE(NEW.country, ''),
        'zip_code', COALESCE(NEW.zip_code, '')));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_leads_notify_insert ON public.customer_leads;
CREATE TRIGGER customer_leads_notify_insert
  AFTER INSERT ON public.customer_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_customer_lead_insert ();
