-- Prepaid delivery (rolling 30 calendar days from period start), USD budget drawdown,
-- price table per category × lead unit type. Wallets remain in DB for legacy flows until migrated.

CREATE TYPE public.lead_unit_type AS ENUM (
  'single',
  'family'
);

-- Inventory leads: classify for routing / pricing (default single).
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_unit_type public.lead_unit_type NOT NULL DEFAULT 'single';

ALTER TABLE public.customer_leads
  ADD COLUMN IF NOT EXISTS lead_unit_type public.lead_unit_type NOT NULL DEFAULT 'single';

ALTER TABLE public.customer_leads
  ADD COLUMN IF NOT EXISTS charged_amount_cents integer CHECK (charged_amount_cents IS NULL OR charged_amount_cents >= 0);

-- Forward reference: FK added after delivery_entitlements exists.
ALTER TABLE public.customer_leads
  ADD COLUMN IF NOT EXISTS entitlement_id uuid;

CREATE TABLE public.lead_pricebook (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  category_id uuid NOT NULL REFERENCES public.categories (id) ON DELETE CASCADE,
  unit_type public.lead_unit_type NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  label text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, unit_type)
);

CREATE INDEX idx_lead_pricebook_category ON public.lead_pricebook (category_id);

CREATE TRIGGER lead_pricebook_updated_at
  BEFORE UPDATE ON public.lead_pricebook
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

CREATE TYPE public.delivery_entitlement_status AS ENUM (
  'active',
  'depleted',
  'expired'
);

CREATE TYPE public.delivery_entitlement_source AS ENUM (
  'prepaid_purchase',
  'topup'
);

CREATE TABLE public.delivery_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  budget_cents_total bigint NOT NULL CHECK (budget_cents_total >= 0),
  budget_cents_remaining bigint NOT NULL CHECK (budget_cents_remaining >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  source public.delivery_entitlement_source NOT NULL DEFAULT 'prepaid_purchase',
  -- Idempotency: one row per Stripe payment reference (nullable for manual grants).
  stripe_payment_ref text UNIQUE,
  status public.delivery_entitlement_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end > period_start),
  CHECK (budget_cents_remaining <= budget_cents_total)
);

CREATE INDEX idx_delivery_entitlements_org_period ON public.delivery_entitlements (organization_id, period_end DESC);

CREATE TRIGGER delivery_entitlements_updated_at
  BEFORE UPDATE ON public.delivery_entitlements
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

ALTER TABLE public.customer_leads
  ADD CONSTRAINT customer_leads_entitlement_id_fkey FOREIGN KEY (entitlement_id) REFERENCES public.delivery_entitlements (id) ON DELETE SET NULL;

CREATE TABLE public.delivery_ledger_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  entitlement_id uuid NOT NULL REFERENCES public.delivery_entitlements (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  balance_after_cents bigint NOT NULL CHECK (balance_after_cents >= 0),
  unit_type public.lead_unit_type NOT NULL,
  category_id uuid NOT NULL REFERENCES public.categories (id) ON DELETE RESTRICT,
  customer_lead_id uuid REFERENCES public.customer_leads (id) ON DELETE SET NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_delivery_ledger_entitlement ON public.delivery_ledger_lines (entitlement_id, created_at DESC);
CREATE INDEX idx_delivery_ledger_org ON public.delivery_ledger_lines (organization_id, created_at DESC);

-- Seed pricebook: one row per category × unit (placeholder prices; staff adjusts in admin later).
INSERT INTO public.lead_pricebook (category_id, unit_type, price_cents, label)
SELECT
  c.id,
  u.unit::public.lead_unit_type,
  CASE WHEN u.unit = 'single' THEN
    2200
  ELSE
    3500
  END,
  CASE WHEN u.unit = 'single' THEN
    'Standard single'
  ELSE
    'Family / multi-person'
  END
FROM
  public.categories c
  CROSS JOIN (
    VALUES ('single'),
      ('family')) AS u (unit)
ON CONFLICT (category_id, unit_type)
  DO NOTHING;

ALTER TABLE public.lead_pricebook ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_pricebook_select_authenticated ON public.lead_pricebook
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY lead_pricebook_staff_write ON public.lead_pricebook
  FOR ALL TO authenticated
  USING (public.is_staff ())
  WITH CHECK (public.is_staff ());

ALTER TABLE public.delivery_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY delivery_entitlements_org_select ON public.delivery_entitlements
  FOR SELECT TO authenticated
  USING (organization_id = public.user_org_id () OR public.is_staff ());

CREATE POLICY delivery_entitlements_staff_insert ON public.delivery_entitlements
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff ());

CREATE POLICY delivery_entitlements_staff_update ON public.delivery_entitlements
  FOR UPDATE TO authenticated
  USING (public.is_staff ())
  WITH CHECK (public.is_staff ());

ALTER TABLE public.delivery_ledger_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY delivery_ledger_org_select ON public.delivery_ledger_lines
  FOR SELECT TO authenticated
  USING (organization_id = public.user_org_id () OR public.is_staff ());

CREATE POLICY delivery_ledger_staff_write ON public.delivery_ledger_lines
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff ());

-- Service role / Edge: create entitlement after Stripe confirms payment (rolling 30 calendar days).
CREATE OR REPLACE FUNCTION public.create_delivery_entitlement (
  p_organization_id uuid,
  p_budget_cents bigint,
  p_stripe_payment_ref text DEFAULT NULL,
  p_period_start timestamptz DEFAULT now(),
  p_source public.delivery_entitlement_source DEFAULT 'prepaid_purchase')
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  v_id uuid;
  v_end timestamptz;
BEGIN
  IF p_budget_cents <= 0 THEN
    RAISE EXCEPTION 'budget must be positive';
  END IF;
  v_end := p_period_start + INTERVAL '30 days';
  IF p_stripe_payment_ref IS NOT NULL THEN
    INSERT INTO public.delivery_entitlements (organization_id, budget_cents_total, budget_cents_remaining, period_start, period_end, stripe_payment_ref, source)
      VALUES (p_organization_id, p_budget_cents, p_budget_cents, p_period_start, v_end, p_stripe_payment_ref, p_source)
    ON CONFLICT (stripe_payment_ref)
      DO NOTHING
    RETURNING
      id INTO v_id;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
    SELECT
      id INTO v_id
    FROM
      public.delivery_entitlements
    WHERE
      stripe_payment_ref = p_stripe_payment_ref;
    RETURN v_id;
  END IF;
  INSERT INTO public.delivery_entitlements (organization_id, budget_cents_total, budget_cents_remaining, period_start, period_end, stripe_payment_ref, source)
    VALUES (p_organization_id, p_budget_cents, p_budget_cents, p_period_start, v_end, NULL, p_source)
  RETURNING
    id INTO v_id;
  RETURN v_id;
END;
$$;

-- Unique constraint required for ON CONFLICT (stripe_payment_ref) — already UNIQUE nullable; multiple NULLs allowed in PG.
-- Idempotency for NULL ref: use application-level dedupe or pass a synthetic ref.

GRANT EXECUTE ON FUNCTION public.create_delivery_entitlement (uuid, bigint, text, timestamptz, public.delivery_entitlement_source) TO service_role;
