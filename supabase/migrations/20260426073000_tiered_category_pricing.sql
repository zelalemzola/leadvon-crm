-- Tiered category pricing (sliding scale) foundation.
-- Additive only: keeps legacy package pricing intact.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS minimum_order_qty integer NOT NULL DEFAULT 1;

ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_minimum_order_qty_check;

ALTER TABLE public.categories
  ADD CONSTRAINT categories_minimum_order_qty_check CHECK (minimum_order_qty >= 1);

CREATE TABLE IF NOT EXISTS public.category_pricing_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  category_id uuid NOT NULL REFERENCES public.categories (id) ON DELETE CASCADE,
  min_qty integer NOT NULL CHECK (min_qty >= 1),
  max_qty integer NULL CHECK (max_qty IS NULL OR max_qty >= min_qty),
  is_active boolean NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.category_pricing_tier_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  tier_id uuid NOT NULL REFERENCES public.category_pricing_tiers (id) ON DELETE CASCADE,
  unit_type public.lead_unit_type NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tier_id, unit_type)
);

CREATE INDEX IF NOT EXISTS idx_category_pricing_tiers_category
  ON public.category_pricing_tiers (category_id, min_qty);

CREATE INDEX IF NOT EXISTS idx_category_pricing_tier_rates_tier
  ON public.category_pricing_tier_rates (tier_id);

DROP TRIGGER IF EXISTS category_pricing_tiers_updated_at ON public.category_pricing_tiers;
CREATE TRIGGER category_pricing_tiers_updated_at
  BEFORE UPDATE ON public.category_pricing_tiers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

DROP TRIGGER IF EXISTS category_pricing_tier_rates_updated_at ON public.category_pricing_tier_rates;
CREATE TRIGGER category_pricing_tier_rates_updated_at
  BEFORE UPDATE ON public.category_pricing_tier_rates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

CREATE OR REPLACE FUNCTION public.assert_no_category_pricing_tier_overlap ()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  v_conflict_id uuid;
BEGIN
  SELECT
    t.id INTO v_conflict_id
  FROM
    public.category_pricing_tiers t
  WHERE
    t.category_id = NEW.category_id
    AND t.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (
      COALESCE(NEW.max_qty, 2147483647) >= t.min_qty
      AND COALESCE(t.max_qty, 2147483647) >= NEW.min_qty
    )
  LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'Tier range overlaps existing tier % for this category', v_conflict_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS category_pricing_tiers_no_overlap ON public.category_pricing_tiers;
CREATE TRIGGER category_pricing_tiers_no_overlap
  BEFORE INSERT OR UPDATE ON public.category_pricing_tiers
  FOR EACH ROW
  EXECUTE FUNCTION public.assert_no_category_pricing_tier_overlap ();

ALTER TABLE public.category_pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_pricing_tier_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS category_pricing_tiers_select_authenticated ON public.category_pricing_tiers;
CREATE POLICY category_pricing_tiers_select_authenticated ON public.category_pricing_tiers
  FOR SELECT TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS category_pricing_tiers_staff_write ON public.category_pricing_tiers;
CREATE POLICY category_pricing_tiers_staff_write ON public.category_pricing_tiers
  FOR ALL TO authenticated
  USING (public.is_staff ())
  WITH CHECK (public.is_staff ());

DROP POLICY IF EXISTS category_pricing_tier_rates_select_authenticated ON public.category_pricing_tier_rates;
CREATE POLICY category_pricing_tier_rates_select_authenticated ON public.category_pricing_tier_rates
  FOR SELECT TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS category_pricing_tier_rates_staff_write ON public.category_pricing_tier_rates;
CREATE POLICY category_pricing_tier_rates_staff_write ON public.category_pricing_tier_rates
  FOR ALL TO authenticated
  USING (public.is_staff ())
  WITH CHECK (public.is_staff ());
