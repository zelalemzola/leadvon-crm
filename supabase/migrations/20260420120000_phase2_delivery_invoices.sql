-- Phase 2 billing foundation:
-- 1) formal invoice records (prepaid purchases + month-end usage),
-- 2) link delivery ledger lines to invoice_id,
-- 3) month-end invoice generation for uninvoiced delivery usage.

CREATE TYPE public.delivery_invoice_type AS ENUM (
  'prepaid_purchase',
  'month_end_usage'
);

CREATE TYPE public.delivery_invoice_status AS ENUM (
  'open',
  'paid',
  'void'
);

CREATE TABLE public.delivery_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  invoice_type public.delivery_invoice_type NOT NULL,
  status public.delivery_invoice_status NOT NULL DEFAULT 'open',
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  subtotal_cents bigint NOT NULL CHECK (subtotal_cents >= 0),
  total_cents bigint NOT NULL CHECK (total_cents >= 0),
  stripe_payment_ref text UNIQUE,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end > period_start)
);

CREATE INDEX idx_delivery_invoices_org_created ON public.delivery_invoices (organization_id, created_at DESC);
CREATE INDEX idx_delivery_invoices_org_period ON public.delivery_invoices (organization_id, period_start DESC);

CREATE TRIGGER delivery_invoices_updated_at
  BEFORE UPDATE ON public.delivery_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

ALTER TABLE public.delivery_ledger_lines
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.delivery_invoices (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_ledger_invoice ON public.delivery_ledger_lines (invoice_id, created_at DESC);

ALTER TABLE public.delivery_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY delivery_invoices_org_select ON public.delivery_invoices
  FOR SELECT TO authenticated
  USING (organization_id = public.user_org_id () OR public.is_staff ());

CREATE POLICY delivery_invoices_staff_write ON public.delivery_invoices
  FOR ALL TO authenticated
  USING (public.is_staff ())
  WITH CHECK (public.is_staff ());

CREATE OR REPLACE FUNCTION public.create_prepaid_purchase_invoice (
  p_organization_id uuid,
  p_amount_cents bigint,
  p_stripe_payment_ref text,
  p_period_start timestamptz DEFAULT now()
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;
  IF p_stripe_payment_ref IS NULL OR btrim(p_stripe_payment_ref) = '' THEN
    RAISE EXCEPTION 'stripe payment ref is required';
  END IF;

  INSERT INTO public.delivery_invoices (
    organization_id,
    invoice_type,
    status,
    period_start,
    period_end,
    subtotal_cents,
    total_cents,
    stripe_payment_ref,
    notes
  )
  VALUES (
    p_organization_id,
    'prepaid_purchase',
    'paid',
    p_period_start,
    p_period_start + INTERVAL '30 days',
    p_amount_cents,
    p_amount_cents,
    p_stripe_payment_ref,
    'Stripe prepaid purchase'
  )
  ON CONFLICT (stripe_payment_ref)
    DO UPDATE SET updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_month_end_delivery_invoices (
  p_month_start date DEFAULT NULL
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_start date := COALESCE(p_month_start, date_trunc('month', now() - INTERVAL '1 month')::date);
  v_end date := (v_start + INTERVAL '1 month')::date;
  v_org uuid;
  v_total bigint;
  v_invoice_id uuid;
  v_count integer := 0;
BEGIN
  FOR v_org IN
    SELECT DISTINCT l.organization_id
    FROM public.delivery_ledger_lines l
    WHERE l.invoice_id IS NULL
      AND l.created_at >= v_start
      AND l.created_at < v_end
  LOOP
    SELECT COALESCE(SUM(l.amount_cents), 0)
    INTO v_total
    FROM public.delivery_ledger_lines l
    WHERE l.organization_id = v_org
      AND l.invoice_id IS NULL
      AND l.created_at >= v_start
      AND l.created_at < v_end;

    IF v_total <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.delivery_invoices (
      organization_id,
      invoice_type,
      status,
      period_start,
      period_end,
      subtotal_cents,
      total_cents,
      notes
    )
    VALUES (
      v_org,
      'month_end_usage',
      'open',
      v_start::timestamptz,
      v_end::timestamptz,
      v_total,
      v_total,
      format('Month-end delivery usage invoice (%s)', to_char(v_start, 'YYYY-MM'))
    )
    RETURNING id INTO v_invoice_id;

    UPDATE public.delivery_ledger_lines l
    SET invoice_id = v_invoice_id
    WHERE l.organization_id = v_org
      AND l.invoice_id IS NULL
      AND l.created_at >= v_start
      AND l.created_at < v_end;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.create_prepaid_purchase_invoice (uuid, bigint, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_prepaid_purchase_invoice (uuid, bigint, text, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.generate_month_end_delivery_invoices (date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_month_end_delivery_invoices (date) TO service_role;
