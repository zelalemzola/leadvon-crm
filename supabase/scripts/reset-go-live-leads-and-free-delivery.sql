-- =============================================================================
-- GO-LIVE RESET — paste into Supabase SQL Editor and run once
-- =============================================================================
-- Clears ALL test lead data and stops every free-delivery campaign so you can
-- start fresh tomorrow.
--
-- REMOVES:
--   • All inventory leads (public.leads)
--   • All delivered customer leads (public.customer_leads) — paid, free, signup
--   • All free-delivery campaign state (public.organization_free_delivery)
--   • Routing logs, delivery ledger lines, lead notifications
--   • External sync cursors/exclusions (Base44/Funnel will re-import on next sync)
--   • Pending routing job idempotency keys
--
-- KEEPS (unchanged):
--   • Auth users, profiles, organizations, categories, pricebook
--   • Prepaid entitlements / budgets, packages, purchases, flow settings
--   • SMS balances and message history
--
-- NOTE: Prepaid budgets are NOT restored to pre-test levels. If test deliveries
-- charged prepaid wallets, top up or adjust entitlements manually before go-live.
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
  v_job_runs integer;
BEGIN
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
  GET DIAGNOSTICS v_job_runs = ROW_COUNT;

  INSERT INTO public.external_sync_cursors (provider, ingest_from, last_synced_at, last_success_at, last_error)
  SELECT
    provider,
    v_go_live_at,
    v_go_live_at,
    v_go_live_at,
    NULL
  FROM (VALUES ('base44'), ('funnel')) AS providers(provider)
  ON CONFLICT (provider) DO UPDATE
  SET
    ingest_from = EXCLUDED.ingest_from,
    last_synced_at = EXCLUDED.last_synced_at,
    last_success_at = EXCLUDED.last_success_at,
    last_error = NULL;

  RAISE NOTICE 'Go-live floor (exact run time UTC): %', v_go_live_at;
  RAISE NOTICE 'Go-live reset complete:';
  RAISE NOTICE '  external ids excluded from re-sync: %', v_excluded;
  RAISE NOTICE '  delivery_routing_events deleted: %', v_routing;
  RAISE NOTICE '  delivery_ledger_lines deleted: %', v_ledger;
  RAISE NOTICE '  customer_notifications deleted: %', v_notifications;
  RAISE NOTICE '  customer_leads deleted: %', v_customer_leads;
  RAISE NOTICE '  leads (inventory) deleted: %', v_leads;
  RAISE NOTICE '  organization_free_delivery rows deleted: %', v_free_delivery;
  RAISE NOTICE '  routing_job_runs deleted: %', v_job_runs;
END;
$$;

COMMIT;

-- Verification (should all be 0)
SELECT 'leads' AS table_name, COUNT(*) AS remaining FROM public.leads
UNION ALL
SELECT 'customer_leads', COUNT(*) FROM public.customer_leads
UNION ALL
SELECT 'organization_free_delivery', COUNT(*) FROM public.organization_free_delivery
UNION ALL
SELECT 'delivery_routing_events', COUNT(*) FROM public.delivery_routing_events
ORDER BY table_name;
