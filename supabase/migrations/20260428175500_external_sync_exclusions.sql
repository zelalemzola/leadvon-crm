CREATE TABLE IF NOT EXISTS public.external_sync_exclusions (
  provider text NOT NULL,
  external_id text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, external_id)
);

DROP TRIGGER IF EXISTS external_sync_exclusions_updated_at ON public.external_sync_exclusions;
CREATE TRIGGER external_sync_exclusions_updated_at
  BEFORE UPDATE ON public.external_sync_exclusions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.external_sync_exclusions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS external_sync_exclusions_staff_select ON public.external_sync_exclusions;
CREATE POLICY external_sync_exclusions_staff_select ON public.external_sync_exclusions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'staff'
    )
  );

DROP POLICY IF EXISTS external_sync_exclusions_staff_write ON public.external_sync_exclusions;
CREATE POLICY external_sync_exclusions_staff_write ON public.external_sync_exclusions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'staff'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'staff'
    )
  );
