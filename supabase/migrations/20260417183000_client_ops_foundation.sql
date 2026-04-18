-- Client operations foundation: recurring lead flow + customer audit logs.

CREATE TABLE IF NOT EXISTS public.customer_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_audit_org_created
  ON public.customer_audit_logs (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.customer_lead_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.lead_packages (id) ON DELETE RESTRICT,
  leads_per_week integer NOT NULL CHECK (leads_per_week > 0),
  is_active boolean NOT NULL DEFAULT true,
  next_run_at timestamptz NOT NULL DEFAULT (now() + interval '7 day'),
  last_run_at timestamptz,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, package_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_lead_flows_org_active
  ON public.customer_lead_flows (organization_id, is_active, next_run_at);

DROP TRIGGER IF EXISTS customer_lead_flows_updated_at ON public.customer_lead_flows;
CREATE TRIGGER customer_lead_flows_updated_at
  BEFORE UPDATE ON public.customer_lead_flows
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

ALTER TABLE public.customer_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_lead_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_audit_logs_select ON public.customer_audit_logs
  FOR SELECT TO authenticated
  USING (
    organization_id = public.user_org_id()
    OR public.is_staff()
  );

CREATE POLICY customer_audit_logs_insert_staff ON public.customer_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY customer_lead_flows_select ON public.customer_lead_flows
  FOR SELECT TO authenticated
  USING (
    organization_id = public.user_org_id()
    OR public.is_staff()
  );

CREATE POLICY customer_lead_flows_update_admin ON public.customer_lead_flows
  FOR UPDATE TO authenticated
  USING (
    (organization_id = public.user_org_id() AND public.is_customer_admin())
    OR public.is_staff()
  )
  WITH CHECK (
    (organization_id = public.user_org_id() AND public.is_customer_admin())
    OR public.is_staff()
  );

CREATE POLICY customer_lead_flows_insert_admin ON public.customer_lead_flows
  FOR INSERT TO authenticated
  WITH CHECK (
    (organization_id = public.user_org_id() AND public.is_customer_admin())
    OR public.is_staff()
  );
