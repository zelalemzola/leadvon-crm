-- SMS balance, automations, message log, and call scripts for customer organizations.

CREATE TYPE public.sms_tx_type AS ENUM ('credit', 'debit');

CREATE TABLE IF NOT EXISTS public.sms_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations (id) ON DELETE CASCADE,
  balance_cents bigint NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  sms_balance_id uuid NOT NULL REFERENCES public.sms_balances (id) ON DELETE CASCADE,
  tx_type public.sms_tx_type NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  reference_type text NOT NULL,
  reference_id text,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sms_transactions_reference_unique
  ON public.sms_transactions (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sms_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_status text NOT NULL CHECK (
    trigger_status IN (
      'new',
      'no_answer',
      'call_back',
      'qualified',
      'not_interested',
      'unqualified',
      'duplicate',
      'closed'
    )
  ),
  message_template text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_automations_org_active
  ON public.sms_automations (organization_id, is_active, trigger_status);

CREATE TABLE IF NOT EXISTS public.sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  customer_lead_id uuid REFERENCES public.customer_leads (id) ON DELETE SET NULL,
  automation_id uuid REFERENCES public.sms_automations (id) ON DELETE SET NULL,
  actor_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  to_phone text NOT NULL,
  body text NOT NULL,
  cost_cents bigint NOT NULL DEFAULT 30,
  twilio_sid text,
  delivery_status text NOT NULL DEFAULT 'queued',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_messages_org_created
  ON public.sms_messages (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.customer_call_scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_call_scripts_org
  ON public.customer_call_scripts (organization_id, updated_at DESC);

CREATE TRIGGER sms_balances_updated_at
  BEFORE UPDATE ON public.sms_balances
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER sms_automations_updated_at
  BEFORE UPDATE ON public.sms_automations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER customer_call_scripts_updated_at
  BEFORE UPDATE ON public.customer_call_scripts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_organization_sms_balance ()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  INSERT INTO public.sms_balances (organization_id)
  VALUES (NEW.id)
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_sms_balance_create ON public.organizations;
CREATE TRIGGER organizations_sms_balance_create
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_organization_sms_balance();

-- Backfill SMS balances for existing organizations.
INSERT INTO public.sms_balances (organization_id)
SELECT id
FROM public.organizations
ON CONFLICT (organization_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.apply_sms_topup (
  p_organization_id uuid,
  p_amount_cents bigint,
  p_reference_id text,
  p_description text DEFAULT 'Stripe SMS balance top-up')
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_balance public.sms_balances%ROWTYPE;
  v_tx_id uuid;
BEGIN
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Top-up amount must be > 0';
  END IF;
  IF p_reference_id IS NULL OR length(trim(p_reference_id)) = 0 THEN
    RAISE EXCEPTION 'Reference is required';
  END IF;

  SELECT *
  INTO v_balance
  FROM public.sms_balances
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.sms_balances (organization_id)
    VALUES (p_organization_id)
    RETURNING * INTO v_balance;
  END IF;

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
    p_organization_id,
    v_balance.id,
    'credit',
    p_amount_cents,
    'stripe_sms_topup',
    p_reference_id,
    p_description
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_tx_id;

  IF v_tx_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.sms_balances
  SET balance_cents = balance_cents + p_amount_cents
  WHERE id = v_balance.id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_sms_send (
  p_organization_id uuid,
  p_customer_lead_id uuid,
  p_automation_id uuid,
  p_actor_id uuid,
  p_to_phone text,
  p_body text,
  p_cost_cents bigint,
  p_twilio_sid text,
  p_delivery_status text,
  p_error_message text DEFAULT NULL)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_balance public.sms_balances%ROWTYPE;
  v_tx_id uuid;
  v_message_id uuid;
  v_ref text;
BEGIN
  IF p_cost_cents <= 0 THEN
    RAISE EXCEPTION 'SMS cost must be > 0';
  END IF;

  SELECT *
  INTO v_balance
  FROM public.sms_balances
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SMS balance not found for organization';
  END IF;

  IF v_balance.balance_cents < p_cost_cents THEN
    RAISE EXCEPTION 'Insufficient SMS balance';
  END IF;

  v_ref := coalesce(p_twilio_sid, gen_random_uuid()::text);

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
    p_organization_id,
    v_balance.id,
    'debit',
    p_cost_cents,
    'sms_send',
    v_ref,
    'SMS sent to lead'
  )
  RETURNING id INTO v_tx_id;

  UPDATE public.sms_balances
  SET balance_cents = balance_cents - p_cost_cents
  WHERE id = v_balance.id;

  INSERT INTO public.sms_messages (
    organization_id,
    customer_lead_id,
    automation_id,
    actor_id,
    to_phone,
    body,
    cost_cents,
    twilio_sid,
    delivery_status,
    error_message
  )
  VALUES (
    p_organization_id,
    p_customer_lead_id,
    p_automation_id,
    p_actor_id,
    p_to_phone,
    p_body,
    p_cost_cents,
    p_twilio_sid,
    coalesce(p_delivery_status, 'sent'),
    p_error_message
  )
  RETURNING id INTO v_message_id;

  RETURN v_message_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_sms_topup (uuid, bigint, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_sms_send (uuid, uuid, uuid, uuid, text, text, bigint, text, text, text) TO service_role;

ALTER TABLE public.sms_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_call_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY sms_balances_customer_select ON public.sms_balances
  FOR SELECT TO authenticated
  USING (organization_id = public.user_org_id() OR public.is_staff());

CREATE POLICY sms_balances_staff_write ON public.sms_balances
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY sms_tx_customer_select ON public.sms_transactions
  FOR SELECT TO authenticated
  USING (organization_id = public.user_org_id() OR public.is_staff());

CREATE POLICY sms_automations_customer_select ON public.sms_automations
  FOR SELECT TO authenticated
  USING (organization_id = public.user_org_id() OR public.is_staff());

CREATE POLICY sms_automations_admin_write ON public.sms_automations
  FOR ALL TO authenticated
  USING (
    public.is_staff()
    OR (
      public.is_customer_admin()
      AND organization_id = public.user_org_id()
    )
  )
  WITH CHECK (
    public.is_staff()
    OR (
      public.is_customer_admin()
      AND organization_id = public.user_org_id()
    )
  );

CREATE POLICY sms_messages_customer_select ON public.sms_messages
  FOR SELECT TO authenticated
  USING (organization_id = public.user_org_id() OR public.is_staff());

CREATE POLICY call_scripts_customer_select ON public.customer_call_scripts
  FOR SELECT TO authenticated
  USING (organization_id = public.user_org_id() OR public.is_staff());

CREATE POLICY call_scripts_admin_write ON public.customer_call_scripts
  FOR ALL TO authenticated
  USING (
    public.is_staff()
    OR (
      public.is_customer_admin()
      AND organization_id = public.user_org_id()
    )
  )
  WITH CHECK (
    public.is_staff()
    OR (
      public.is_customer_admin()
      AND organization_id = public.user_org_id()
    )
  );
