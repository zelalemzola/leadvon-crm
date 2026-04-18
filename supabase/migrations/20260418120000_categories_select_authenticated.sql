-- Categories are reference data; customers need names for filters and joins.
CREATE POLICY categories_select_authenticated ON public.categories
  FOR SELECT TO authenticated
  USING (true);
