-- Org-scoped purchase (for cron / service role), due-flow runner, support contacts.

-- Same logic as customer_purchase_package but explicit org + actor (no JWT).
CREATE OR REPLACE FUNCTION public.customer_purchase_package_for_org (
  p_org_id uuid,
  p_package_id uuid,
  p_quantity integer,
  p_actor_id uuid
)
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
  v_actor_id uuid := p_actor_id;
  v_package record;
  v_offer_id uuid;
  v_discount numeric(5,2) := 0;
  v_unit_price integer;
  v_leads_needed integer;
  v_total bigint;
  v_wallet record;
  v_purchase_id uuid;
  v_allocated integer;
BEGIN
  IF p_quantity < 1 THEN
    RAISE EXCEPTION 'Quantity must be >= 1';
  END IF;

  SELECT lp.*
  INTO v_package
  FROM public.lead_packages lp
  WHERE lp.id = p_package_id
    AND lp.active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package not available';
  END IF;

  v_unit_price := v_package.price_cents;
  v_leads_needed := v_package.leads_count * p_quantity;

  SELECT lo.id, lo.discount_percent
  INTO v_offer_id, v_discount
  FROM public.lead_offers lo
  WHERE lo.package_id = p_package_id
    AND lo.active = true
    AND (lo.starts_at IS NULL OR lo.starts_at <= now())
    AND (lo.ends_at IS NULL OR lo.ends_at >= now())
  ORDER BY lo.discount_percent DESC, lo.created_at ASC
  LIMIT 1;

  v_total := ROUND((v_unit_price::numeric * p_quantity::numeric) * ((100 - COALESCE(v_discount, 0)) / 100.0));

  SELECT w.*
  INTO v_wallet
  FROM public.wallets w
  WHERE w.organization_id = v_org_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;
  IF v_wallet.balance_cents < v_total THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  WITH selected AS (
    SELECT l.*
    FROM public.leads l
    WHERE l.category_id = v_package.category_id
      AND l.sold_at IS NULL
    ORDER BY l.created_at ASC
    LIMIT v_leads_needed
    FOR UPDATE SKIP LOCKED
  )
  SELECT count(*)::integer INTO v_allocated FROM selected;

  IF v_allocated < v_leads_needed THEN
    RAISE EXCEPTION 'Not enough leads available for this package';
  END IF;

  UPDATE public.wallets
  SET balance_cents = balance_cents - v_total
  WHERE id = v_wallet.id;

  INSERT INTO public.lead_purchases (
    organization_id,
    package_id,
    offer_id,
    quantity,
    leads_allocated,
    unit_price_cents,
    discount_percent,
    total_amount_cents,
    currency,
    purchased_by
  )
  VALUES (
    v_org_id,
    p_package_id,
    v_offer_id,
    p_quantity,
    v_allocated,
    v_unit_price,
    COALESCE(v_discount, 0),
    v_total,
    'USD',
    v_actor_id
  )
  RETURNING id INTO v_purchase_id;

  INSERT INTO public.wallet_transactions (
    organization_id,
    wallet_id,
    tx_type,
    amount_cents,
    reference_type,
    reference_id,
    description
  )
  VALUES (
    v_org_id,
    v_wallet.id,
    'debit',
    v_total,
    'lead_purchase',
    v_purchase_id::text,
    'Lead package purchase'
  );

  WITH selected AS (
    SELECT l.*
    FROM public.leads l
    WHERE l.category_id = v_package.category_id
      AND l.sold_at IS NULL
    ORDER BY l.created_at ASC
    LIMIT v_leads_needed
    FOR UPDATE SKIP LOCKED
  ), updated AS (
    UPDATE public.leads l
    SET sold_at = now()
    FROM selected s
    WHERE l.id = s.id
    RETURNING l.*
  )
  INSERT INTO public.customer_leads (
    organization_id,
    source_lead_id,
    category_id,
    purchase_id,
    phone,
    first_name,
    last_name,
    notes
  )
  SELECT
    v_org_id,
    u.id,
    u.category_id,
    v_purchase_id,
    u.phone,
    u.first_name,
    u.last_name,
    u.notes
  FROM updated u;

  purchase_id := v_purchase_id;
  total_amount_cents := v_total;
  leads_allocated := v_allocated;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.customer_purchase_package_for_org (uuid, uuid, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_purchase_package_for_org (uuid, uuid, integer, uuid) TO service_role;

-- Process all due lead flows (weekly cadence). Skips failures per flow.
CREATE OR REPLACE FUNCTION public.run_due_customer_lead_flows ()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  r record;
  v_qty integer;
  v_actor uuid;
  v_processed integer := 0;
  v_row record;
BEGIN
  FOR r IN
  SELECT
    f.id AS flow_id,
    f.organization_id,
    f.package_id,
    f.leads_per_week,
    f.created_by,
    lp.leads_count
  FROM public.customer_lead_flows f
  JOIN public.lead_packages lp ON lp.id = f.package_id
    AND lp.active = true
  WHERE f.is_active = true
    AND f.next_run_at <= now()
  LOOP
    IF r.leads_count < 1 THEN
      CONTINUE;
    END IF;

    v_qty := GREATEST(1, CEIL(r.leads_per_week::numeric / r.leads_count::numeric)::integer);

    v_actor := r.created_by;
    IF v_actor IS NULL THEN
      SELECT p.id INTO v_actor
      FROM public.profiles p
      WHERE p.organization_id = r.organization_id
        AND p.role = 'customer_admin'
        AND p.is_active = true
      ORDER BY p.created_at ASC
      LIMIT 1;
    END IF;

    IF v_actor IS NULL THEN
      CONTINUE;
    END IF;

    BEGIN
      SELECT *
      INTO v_row
      FROM public.customer_purchase_package_for_org (
        r.organization_id,
        r.package_id,
        v_qty,
        v_actor
      )
      LIMIT 1;

      UPDATE public.customer_lead_flows
      SET last_run_at = now(),
        next_run_at = now() + interval '7 day'
      WHERE id = r.flow_id;

      v_processed := v_processed + 1;
    EXCEPTION
      WHEN OTHERS THEN
        -- leave next_run_at unchanged so it retries
        CONTINUE;
    END;
  END LOOP;

  RETURN v_processed;
END;
$$;

REVOKE ALL ON FUNCTION public.run_due_customer_lead_flows () FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_due_customer_lead_flows () TO service_role;

-- Support contacts (global rows: organization_id IS NULL)
CREATE TABLE IF NOT EXISTS public.support_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  organization_id uuid REFERENCES public.organizations (id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  email text,
  phone text,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_contacts_org_sort ON public.support_contacts (organization_id, sort_order);

DROP TRIGGER IF EXISTS support_contacts_updated_at ON public.support_contacts;
CREATE TRIGGER support_contacts_updated_at
  BEFORE UPDATE ON public.support_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

ALTER TABLE public.support_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_contacts_staff_all ON public.support_contacts
  FOR ALL TO authenticated
  USING (public.is_staff ())
  WITH CHECK (public.is_staff ());

CREATE POLICY support_contacts_customer_select ON public.support_contacts
  FOR SELECT TO authenticated
  USING (
    organization_id IS NULL
    OR organization_id = public.user_org_id ()
    OR public.is_staff ()
  );

INSERT INTO public.support_contacts (organization_id, sort_order, title, email, phone, description)
SELECT NULL, 1, 'Email', 'support@leadvon.com', NULL, 'Priority response for account and billing issues.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.support_contacts c WHERE c.organization_id IS NULL AND c.title = 'Email'
);

INSERT INTO public.support_contacts (organization_id, sort_order, title, email, phone, description)
SELECT NULL, 2, 'Phone', NULL, '+1 (555) 010-8844', 'Mon-Fri, 9:00 AM - 6:00 PM EST'
WHERE NOT EXISTS (
  SELECT 1 FROM public.support_contacts c WHERE c.organization_id IS NULL AND c.title = 'Phone'
);

INSERT INTO public.support_contacts (organization_id, sort_order, title, email, phone, description)
SELECT NULL, 3, 'Sales ops', 'ops@leadvon.com', NULL, 'Lead quality and campaign support.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.support_contacts c WHERE c.organization_id IS NULL AND c.title = 'Sales ops'
);
