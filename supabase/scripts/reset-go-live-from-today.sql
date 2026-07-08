-- =============================================================================
-- GO-LIVE RESET (v3) — wipe leads + import ONLY from the moment you run this
-- =============================================================================
-- Run in Supabase SQL Editor AFTER deploying app code that respects ingest_from.
--
-- 1. Records the exact run time (UTC) as the ingest floor
-- 2. Permanently excludes every Base44/Funnel id currently in inventory (dummy data)
-- 3. Wipes inventory, customer leads, and free-delivery campaigns
-- 4. Sets sync cursors so background jobs only pick up leads created AFTER this run
-- =============================================================================

BEGIN;

ALTER TABLE public.external_sync_cursors
  ADD COLUMN IF NOT EXISTS ingest_from timestamptz;

DO $$
DECLARE
  v_go_live_at timestamptz := now();
  v_excluded integer;
  v_routing integer;
  v_ledger integer;
  v_notifications integer;
  v_customer_leads integer;
  v_leads integer;
  v_free_delivery integer;
BEGIN
  -- Block all external ids we already have from ever syncing back in.
  INSERT INTO public.external_sync_exclusions (provider, external_id, reason)
  SELECT
    l.source_system,
    l.source_external_id,
    'go_live_wipe'
  FROM public.leads l
  WHERE l.source_system IN ('base44', 'funnel')
    AND l.source_external_id IS NOT NULL
  ON CONFLICT (provider, external_id) DO NOTHING;

  GET DIAGNOSTICS v_excluded = ROW_COUNT;

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

  INSERT INTO public.external_sync_cursors (provider, ingest_from, last_synced_at, last_success_at, last_error)
  VALUES
    ('base44', v_go_live_at, v_go_live_at, v_go_live_at, NULL),
    ('funnel', v_go_live_at, v_go_live_at, v_go_live_at, NULL)
  ON CONFLICT (provider) DO UPDATE
  SET
    ingest_from = EXCLUDED.ingest_from,
    last_synced_at = EXCLUDED.last_synced_at,
    last_success_at = EXCLUDED.last_success_at,
    last_error = NULL;

  RAISE NOTICE 'Go-live floor (exact run time UTC): %', v_go_live_at;
  RAISE NOTICE 'External ids excluded from re-sync: %', v_excluded;
  RAISE NOTICE 'Deleted leads: %, customer_leads: %, free_delivery campaigns: %',
    v_leads, v_customer_leads, v_free_delivery;
END;
$$;

COMMIT;

SELECT provider, ingest_from, last_synced_at, last_success_at
FROM public.external_sync_cursors
WHERE provider IN ('base44', 'funnel')
ORDER BY provider;

SELECT 'leads' AS table_name, COUNT(*) AS remaining FROM public.leads
UNION ALL
SELECT 'customer_leads', COUNT(*) FROM public.customer_leads
UNION ALL
SELECT 'external_sync_exclusions', COUNT(*) FROM public.external_sync_exclusions
ORDER BY table_name;
