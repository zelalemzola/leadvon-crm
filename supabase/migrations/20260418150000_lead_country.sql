-- Country on inventory leads and customer copies (dashboard / filters).

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT '';

ALTER TABLE public.customer_leads
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_customer_leads_org_country
  ON public.customer_leads (organization_id, country);

-- Propagate country when allocating leads to customers (JWT purchase).
CREATE OR REPLACE FUNCTION public.customer_purchase_package (p_package_id uuid, p_quantity integer DEFAULT 1)
  RETURNS TABLE (
    purchase_id uuid,
    total_amount_cents bigint,
    leads_allocated integer)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  v_org_id uuid;
  v_actor_id uuid;
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
  v_actor_id := auth.uid();
  v_org_id := public.user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization context';
  END IF;

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
    notes,
    country
  )
  SELECT
    v_org_id,
    u.id,
    u.category_id,
    v_purchase_id,
    u.phone,
    u.first_name,
    u.last_name,
    u.notes,
    u.country
  FROM updated u;

  purchase_id := v_purchase_id;
  total_amount_cents := v_total;
  leads_allocated := v_allocated;
  RETURN NEXT;
END;
$$;

-- Org-scoped purchase (cron / service role): include country on copy.
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
    notes,
    country
  )
  SELECT
    v_org_id,
    u.id,
    u.category_id,
    v_purchase_id,
    u.phone,
    u.first_name,
    u.last_name,
    u.notes,
    u.country
  FROM updated u;

  purchase_id := v_purchase_id;
  total_amount_cents := v_total;
  leads_allocated := v_allocated;
  RETURN NEXT;
END;
$$;
