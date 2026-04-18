-- Client portal reads packages/offers for billing; staff policies remain for writes.
-- Without SELECT for customers, RLS returns zero rows and catalog dropdowns stay empty.

CREATE POLICY lead_packages_select_active_catalog ON public.lead_packages
  FOR SELECT TO authenticated
  USING (active = true);

CREATE POLICY lead_offers_select_active_catalog ON public.lead_offers
  FOR SELECT TO authenticated
  USING (active = true);
