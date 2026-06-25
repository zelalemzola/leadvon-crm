-- Strict tenant isolation for customer team members.
-- 1) Detach staff profiles from customer organizations.
-- 2) Tighten profiles RLS so customers only see customer roles in their org.
-- 3) Enforce role/org consistency on profiles.
-- 4) Enforce lead assignees belong to the same organization.

-- Detach staff from any customer organization (historical data cleanup).
UPDATE public.profiles
SET
  organization_id = NULL,
  lead_assignment_percentage = 0
WHERE
  role = 'staff'
  AND organization_id IS NOT NULL;

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR public.is_staff()
    OR (
      public.user_org_id() IS NOT NULL
      AND organization_id = public.user_org_id()
      AND role IN ('customer_admin', 'customer_agent')
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
      AND role IN ('customer_admin', 'customer_agent')
    )
  )
  WITH CHECK (
    auth.uid() = id
    OR public.is_staff()
    OR (
      public.is_customer_admin()
      AND organization_id = public.user_org_id()
      AND role IN ('customer_admin', 'customer_agent')
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_profile_tenant_consistency ()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW.role = 'staff' THEN
    NEW.organization_id := NULL;
    NEW.lead_assignment_percentage := 0;
  ELSIF NEW.organization_id IS NOT NULL
    AND NEW.role NOT IN ('customer_admin', 'customer_agent') THEN
    RAISE EXCEPTION 'Only customer_admin and customer_agent profiles may belong to an organization';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_enforce_tenant_consistency ON public.profiles;
CREATE TRIGGER profiles_enforce_tenant_consistency
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_tenant_consistency ();

CREATE OR REPLACE FUNCTION public.enforce_customer_lead_assignee_org ()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $$
DECLARE
  v_assignee_org uuid;
BEGIN
  IF NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    p.organization_id INTO v_assignee_org
  FROM
    public.profiles p
  WHERE
    p.id = NEW.assigned_to
    AND p.role IN ('customer_admin', 'customer_agent')
    AND p.is_active = TRUE;

  IF v_assignee_org IS NULL
    OR v_assignee_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Assignee must be an active customer user in the same organization';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_leads_enforce_assignee_org ON public.customer_leads;
CREATE TRIGGER customer_leads_enforce_assignee_org
  BEFORE INSERT OR UPDATE OF assigned_to ON public.customer_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_customer_lead_assignee_org ();
