-- Customer portal MVP schema, RLS, and purchase flow.

CREATE TYPE public.customer_lead_status AS ENUM (
  'new',
  'no_answer',
  'call_back',
  'qualified',
  'not_interested',
  'unqualified',
  'duplicate',
  'closed'
);

CREATE TYPE public.wallet_tx_type AS ENUM ('credit', 'debit');

CREATE TABLE IF NOT EXISTS public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations (id) ON DELETE CASCADE,
  balance_cents bigint NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES public.wallets (id) ON DELETE CASCADE,
  tx_type public.wallet_tx_type NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  reference_type text NOT NULL,
  reference_id text,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.lead_packages (id) ON DELETE RESTRICT,
  offer_id uuid REFERENCES public.lead_offers (id) ON DELETE SET NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  leads_allocated integer NOT NULL CHECK (leads_allocated >= 0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  discount_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  total_amount_cents bigint NOT NULL CHECK (total_amount_cents >= 0),
  currency text NOT NULL DEFAULT 'USD',
  purchased_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  source_lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE RESTRICT,
  category_id uuid NOT NULL REFERENCES public.categories (id) ON DELETE RESTRICT,
  purchase_id uuid NOT NULL REFERENCES public.lead_purchases (id) ON DELETE CASCADE,
  phone text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  notes text NOT NULL DEFAULT '',
  status public.customer_lead_status NOT NULL DEFAULT 'new',
  assigned_to uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  status_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_org_created ON public.wallet_transactions (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_purchases_org_created ON public.lead_purchases (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_leads_org_created ON public.customer_leads (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_leads_org_status ON public.customer_leads (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_customer_leads_assignee ON public.customer_leads (assigned_to);

CREATE TRIGGER wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

CREATE TRIGGER customer_leads_updated_at
  BEFORE UPDATE ON public.customer_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

-- Auto-create wallet for new organizations.
CREATE OR REPLACE FUNCTION public.handle_new_organization_wallet ()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
BEGIN
  INSERT INTO public.wallets (organization_id)
    VALUES (NEW.id)
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_wallet_create ON public.organizations;
CREATE TRIGGER organizations_wallet_create
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_organization_wallet ();

CREATE OR REPLACE FUNCTION public.user_org_id ()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
  SELECT p.organization_id
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.user_org_id () TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_org_id () TO service_role;

CREATE OR REPLACE FUNCTION public.is_customer_admin ()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'customer_admin'
      AND p.is_active = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_customer_admin () TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_customer_admin () TO service_role;

-- Atomic package purchase from wallet.
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

  -- lock target leads
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

GRANT EXECUTE ON FUNCTION public.customer_purchase_package (uuid, integer) TO authenticated;

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY wallets_customer_select ON public.wallets
  FOR SELECT TO authenticated
  USING (organization_id = public.user_org_id() OR public.is_staff());

CREATE POLICY wallets_staff_write ON public.wallets
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY wallet_tx_customer_select ON public.wallet_transactions
  FOR SELECT TO authenticated
  USING (organization_id = public.user_org_id() OR public.is_staff());

CREATE POLICY lead_purchases_customer_select ON public.lead_purchases
  FOR SELECT TO authenticated
  USING (organization_id = public.user_org_id() OR public.is_staff());

CREATE POLICY customer_leads_select ON public.customer_leads
  FOR SELECT TO authenticated
  USING (
    organization_id = public.user_org_id()
    OR public.is_staff()
  );

CREATE POLICY customer_leads_update ON public.customer_leads
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.user_org_id()
    OR public.is_staff()
  )
  WITH CHECK (
    organization_id = public.user_org_id()
    OR public.is_staff()
  );

-- customer members discovery/management policies on profiles.
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR public.is_staff()
    OR (
      organization_id IS NOT NULL
      AND organization_id = public.user_org_id()
    )
  );

DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = id
    OR public.is_staff()
    OR (
      public.is_customer_admin()
      AND organization_id = public.user_org_id()
    )
  )
  WITH CHECK (
    auth.uid() = id
    OR public.is_staff()
    OR (
      public.is_customer_admin()
      AND organization_id = public.user_org_id()
    )
  );
