-- Stripe wallet top-up idempotency and credit helpers.

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_reference_unique
  ON public.wallet_transactions (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.apply_wallet_topup (
  p_organization_id uuid,
  p_amount_cents bigint,
  p_reference_id text,
  p_description text DEFAULT 'Stripe wallet top-up')
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_wallet public.wallets%ROWTYPE;
  v_tx_id uuid;
BEGIN
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Top-up amount must be > 0';
  END IF;
  IF p_reference_id IS NULL OR length(trim(p_reference_id)) = 0 THEN
    RAISE EXCEPTION 'Reference is required';
  END IF;

  SELECT *
  INTO v_wallet
  FROM public.wallets
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for organization';
  END IF;

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
    p_organization_id,
    v_wallet.id,
    'credit',
    p_amount_cents,
    'stripe_topup',
    p_reference_id,
    p_description
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_tx_id;

  IF v_tx_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.wallets
  SET balance_cents = balance_cents + p_amount_cents
  WHERE id = v_wallet.id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_wallet_topup (uuid, bigint, text, text) TO service_role;

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY stripe_webhook_events_staff_select ON public.stripe_webhook_events
  FOR SELECT TO authenticated
  USING (public.is_staff());
