-- Reusable SMS message templates per organization (for manual send + bulk send).

CREATE TABLE IF NOT EXISTS public.sms_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  body text NOT NULL,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_templates_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  CONSTRAINT sms_templates_body_len CHECK (char_length(body) BETWEEN 1 AND 1600)
);

CREATE INDEX IF NOT EXISTS idx_sms_templates_org_updated
  ON public.sms_templates (organization_id, updated_at DESC);

CREATE TRIGGER sms_templates_updated_at
  BEFORE UPDATE ON public.sms_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY sms_templates_customer_select ON public.sms_templates
  FOR SELECT TO authenticated
  USING (organization_id = public.user_org_id() OR public.is_staff());

CREATE POLICY sms_templates_admin_write ON public.sms_templates
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
