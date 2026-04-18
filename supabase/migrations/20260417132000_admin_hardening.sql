-- Admin hardening: offers, audit logs, staff lifecycle controls.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_profiles_active_role ON public.profiles (role, is_active);

CREATE TABLE IF NOT EXISTS public.lead_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  package_id uuid NOT NULL REFERENCES public.lead_packages (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  discount_percent numeric(5,2) NOT NULL CHECK (discount_percent >= 0 AND discount_percent <= 100),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_offer_window CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_lead_offers_package ON public.lead_offers (package_id);
CREATE INDEX IF NOT EXISTS idx_lead_offers_active_dates ON public.lead_offers (active, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_actor_created ON public.admin_audit_logs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action_created ON public.admin_audit_logs (action, created_at DESC);

DROP TRIGGER IF EXISTS lead_offers_updated_at ON public.lead_offers;
CREATE TRIGGER lead_offers_updated_at
  BEFORE UPDATE ON public.lead_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

-- Ensure inactive staff lose staff access.
CREATE OR REPLACE FUNCTION public.is_staff ()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid ()
      AND p.role = 'staff'
      AND p.is_active = true);
$$;

GRANT EXECUTE ON FUNCTION public.is_staff () TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff () TO service_role;

ALTER TABLE public.lead_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_offers_staff_all ON public.lead_offers;
CREATE POLICY lead_offers_staff_all ON public.lead_offers
  FOR ALL TO authenticated
  USING (public.is_staff ())
  WITH CHECK (public.is_staff ());

DROP POLICY IF EXISTS admin_audit_logs_staff_read ON public.admin_audit_logs;
CREATE POLICY admin_audit_logs_staff_read ON public.admin_audit_logs
  FOR SELECT TO authenticated
  USING (public.is_staff ());

DROP POLICY IF EXISTS admin_audit_logs_staff_insert ON public.admin_audit_logs;
CREATE POLICY admin_audit_logs_staff_insert ON public.admin_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff ());

CREATE OR REPLACE FUNCTION public.admin_activity_by_staff (days_back integer DEFAULT 14)
  RETURNS TABLE (
    actor_id uuid,
    email text,
    full_name text,
    action_count bigint)
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = public
  AS $$
  SELECT p.id AS actor_id,
    p.email,
    p.full_name,
    count(a.id)::bigint AS action_count
  FROM public.profiles p
    LEFT JOIN public.admin_audit_logs a ON a.actor_id = p.id
      AND a.created_at >= (now() - (days_back || ' days')::interval)
  WHERE p.role = 'staff'
  GROUP BY p.id, p.email, p.full_name
  ORDER BY action_count DESC, p.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.admin_activity_by_staff (integer) TO authenticated;
