-- Twilio delivery reconciliation and idempotent refunds for failed SMS.

ALTER TABLE public.sms_messages
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS sms_messages_twilio_sid_unique
  ON public.sms_messages (twilio_sid)
  WHERE twilio_sid IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reconcile_sms_delivery (
  p_twilio_sid text,
  p_delivery_status text,
  p_error_message text DEFAULT NULL)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_message public.sms_messages%ROWTYPE;
  v_balance public.sms_balances%ROWTYPE;
  v_status text;
  v_refund_ref text;
  v_is_failure boolean;
  v_refund_tx_id uuid;
BEGIN
  IF p_twilio_sid IS NULL OR length(trim(p_twilio_sid)) = 0 THEN
    RAISE EXCEPTION 'Twilio SID is required';
  END IF;

  v_status := lower(coalesce(trim(p_delivery_status), 'unknown'));
  v_is_failure := v_status IN ('failed', 'undelivered');

  SELECT *
  INTO v_message
  FROM public.sms_messages
  WHERE twilio_sid = p_twilio_sid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.sms_messages
  SET
    delivery_status = v_status,
    error_message = coalesce(p_error_message, error_message),
    delivered_at = CASE
      WHEN v_status = 'delivered' AND delivered_at IS NULL THEN now()
      ELSE delivered_at
    END,
    failed_at = CASE
      WHEN v_is_failure AND failed_at IS NULL THEN now()
      ELSE failed_at
    END
  WHERE id = v_message.id;

  IF NOT v_is_failure THEN
    RETURN true;
  END IF;

  IF v_message.refunded_at IS NOT NULL THEN
    RETURN true;
  END IF;

  SELECT *
  INTO v_balance
  FROM public.sms_balances
  WHERE organization_id = v_message.organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SMS balance not found for organization';
  END IF;

  v_refund_ref := format('sms_refund:%s', v_message.id);

  INSERT INTO public.sms_transactions (
    organization_id,
    sms_balance_id,
    tx_type,
    amount_cents,
    reference_type,
    reference_id,
    description
  )
  VALUES (
    v_message.organization_id,
    v_balance.id,
    'credit',
    v_message.cost_cents,
    'sms_refund',
    v_refund_ref,
    format('SMS refund for failed delivery (%s)', p_twilio_sid)
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_refund_tx_id;

  IF v_refund_tx_id IS NULL THEN
    RETURN true;
  END IF;

  UPDATE public.sms_balances
  SET balance_cents = balance_cents + v_message.cost_cents
  WHERE id = v_balance.id;

  UPDATE public.sms_messages
  SET refunded_at = now()
  WHERE id = v_message.id
    AND refunded_at IS NULL;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_sms_delivery (text, text, text) TO service_role;
