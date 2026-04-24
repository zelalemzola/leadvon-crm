-- Base44 ingestion foundation:
-- 1) Track source metadata on inventory leads
-- 2) Store sync cursor / health state for incremental pulls

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS source_system text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_external_id text,
  ADD COLUMN IF NOT EXISTS source_payload jsonb,
  ADD COLUMN IF NOT EXISTS source_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_updated_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_source_external
  ON public.leads (source_system, source_external_id)
  WHERE source_external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_source_updated
  ON public.leads (source_system, source_updated_at DESC);

CREATE TABLE IF NOT EXISTS public.external_sync_cursors (
  provider text PRIMARY KEY,
  last_synced_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS external_sync_cursors_updated_at ON public.external_sync_cursors;
CREATE TRIGGER external_sync_cursors_updated_at
  BEFORE UPDATE ON public.external_sync_cursors
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

ALTER TABLE public.external_sync_cursors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS external_sync_cursors_staff_select ON public.external_sync_cursors;
CREATE POLICY external_sync_cursors_staff_select ON public.external_sync_cursors
  FOR SELECT TO authenticated
  USING (public.is_staff ());

DROP POLICY IF EXISTS external_sync_cursors_staff_write ON public.external_sync_cursors;
CREATE POLICY external_sync_cursors_staff_write ON public.external_sync_cursors
  FOR ALL TO authenticated
  USING (public.is_staff ())
  WITH CHECK (public.is_staff ());
