-- Only import external leads created on/after ingest_from (go-live cutover).
-- Set via SQL after a wipe, or with env LEAD_INGEST_FROM_DATE / LEAD_INGEST_FROM_UTC.

ALTER TABLE public.external_sync_cursors
  ADD COLUMN IF NOT EXISTS ingest_from timestamptz;

COMMENT ON COLUMN public.external_sync_cursors.ingest_from IS
  'Do not import leads from Base44/Funnel with source created/updated timestamps before this instant.';
