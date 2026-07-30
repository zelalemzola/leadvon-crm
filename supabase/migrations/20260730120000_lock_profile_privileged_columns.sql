-- Prevent authenticated users from privilege-escalating via profiles UPDATE.
--
-- Context: profiles_update RLS allows auth.uid() = id with no column limits, so a
-- signed-in customer could set role = 'staff' and inherit leads_staff_all etc.
-- App role/org changes already go through the service-role API; this locks the
-- direct PostgREST path without changing those server routes.
--
-- Approach (both layers):
-- 1) BEFORE UPDATE trigger pins privileged columns for non-staff JWT callers.
--    Skips when auth.uid() IS NULL so service_role updates keep working.
-- 2) Column-scoped GRANT: authenticated may only UPDATE safe profile fields.
--    REVOKE table-level UPDATE first (Supabase default grants make column
--    REVOKE alone a no-op while table UPDATE remains).

CREATE OR REPLACE FUNCTION public.enforce_profile_tenant_consistency ()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $$
BEGIN
  -- Non-staff callers using a user JWT cannot change privileged fields.
  -- service_role (auth.uid() IS NULL) and active staff are unaffected.
  IF TG_OP = 'UPDATE'
    AND auth.uid() IS NOT NULL
    AND NOT public.is_staff() THEN
    NEW.role := OLD.role;
    NEW.is_active := OLD.is_active;
    NEW.organization_id := OLD.organization_id;
    NEW.lead_assignment_percentage := OLD.lead_assignment_percentage;
  END IF;

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

-- Privilege layer: JWT roles cannot UPDATE privileged columns at all.
-- service_role keeps its existing full UPDATE grant (unchanged).
REVOKE UPDATE ON TABLE public.profiles FROM anon;
REVOKE UPDATE ON TABLE public.profiles FROM authenticated;

GRANT UPDATE (email, full_name, phone, updated_at)
  ON TABLE public.profiles TO authenticated;
