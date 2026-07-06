-- =============================================================================
-- GO-LIVE RESET (v2) — wipe leads + only import NEW external leads from today
-- =============================================================================
-- Run this in Supabase SQL Editor AFTER deploying app code that respects ingest_from.
--
-- What this fixes:
--   Your previous reset set sync cursors to NULL, so Base44/Funnel background jobs
--   re-imported ALL historical dummy leads. This script:
--     1. Wipes inventory + delivered leads again
--     2. Sets ingest_from = start of today (UTC) on both providers
--     3. Sets last_synced_at to the same floor so incremental sync starts clean
--
-- Change v_go_live_day below if you need a different cutover date.
-- =============================================================================

BEGIN;

ALTER TABLE public.external_sync_cursors
  ADD COLUMN IF NOT EXISTS ingest_from timestamptz;

DO $$
DECLARE
  v_go_live_day timestamptz := date_trunc('day', (now() AT TIME ZONE 'UTC')) AT TIME ZONE 'UTC';
  v_routing integer;
  v_ledger integer;
  v_notifications integer;
  v_customer_leads integer;
  v_leads integer;
  v_free_delivery integer;
BEGIN
  DELETE FROM public.delivery_routing_events;
  GET DIAGNOSTICS v_routing = ROW_COUNT;

  DELETE FROM public.delivery_ledger_lines;
  GET DIAGNOSTICS v_ledger = ROW_COUNT;

  DELETE FROM public.customer_notifications
  WHERE type = 'lead_received'
     OR entity_type = 'customer_lead';
  GET DIAGNOSTICS v_notifications = ROW_COUNT;

  DELETE FROM public.customer_leads;
  GET DIAGNOSTICS v_customer_leads = ROW_COUNT;

  DELETE FROM public.leads;
  GET DIAGNOSTICS v_leads = ROW_COUNT;

  DELETE FROM public.organization_free_delivery;
  GET DIAGNOSTICS v_free_delivery = ROW_COUNT;

  UPDATE public.customer_lead_flows
  SET
    pending_delivery_leads = 0,
    delivered_this_month = 0,
    accrued_this_month = 0;

  DELETE FROM public.routing_job_runs;
  DELETE FROM public.external_sync_exclusions;

  INSERT INTO public.external_sync_cursors (provider, ingest_from, last_synced_at, last_success_at, last_error)
  VALUES
    ('base44', v_go_live_day, v_go_live_day, now(), NULL),
    ('funnel', v_go_live_day, v_go_live_day, now(), NULL)
  ON CONFLICT (provider) DO UPDATE
  SET
    ingest_from = EXCLUDED.ingest_from,
    last_synced_at = EXCLUDED.last_synced_at,
    last_success_at = EXCLUDED.last_success_at,
    last_error = NULL;

  RAISE NOTICE 'Go-live floor (UTC): %', v_go_live_day;
  RAISE NOTICE 'Deleted leads: %, customer_leads: %, free_delivery campaigns: %',
    v_leads, v_customer_leads, v_free_delivery;
END;
$$;

COMMIT;

SELECT provider, ingest_from, last_synced_at
FROM public.external_sync_cursors
WHERE provider IN ('base44', 'funnel')
ORDER BY provider;

SELECT 'leads' AS table_name, COUNT(*) AS remaining FROM public.leads
UNION ALL
SELECT 'customer_leads', COUNT(*) FROM public.customer_leads
ORDER BY table_name;
