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
  v_routing integer;
  v_ledger integer;
  v_notifications integer;
  v_customer_leads integer;
  v_leads integer;
  v_free_delivery integer;
  v_job_runs integer;
  v_exclusions integer;
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
  GET DIAGNOSTICS v_job_runs = ROW_COUNT;

  DELETE FROM public.external_sync_exclusions;
  GET DIAGNOSTICS v_exclusions = ROW_COUNT;

  -- Do NOT null cursors — that causes full historical re-import.
  -- After running migration 20260707010000, set ingest_from to start of today (UTC).
  INSERT INTO public.external_sync_cursors (provider, ingest_from, last_synced_at, last_success_at, last_error)
  SELECT
    provider,
    date_trunc('day', (now() AT TIME ZONE 'UTC')) AT TIME ZONE 'UTC',
    date_trunc('day', (now() AT TIME ZONE 'UTC')) AT TIME ZONE 'UTC',
    now(),
    NULL
  FROM (VALUES ('base44'), ('funnel')) AS providers(provider)
  ON CONFLICT (provider) DO UPDATE
  SET
    ingest_from = EXCLUDED.ingest_from,
    last_synced_at = EXCLUDED.last_synced_at,
    last_success_at = EXCLUDED.last_success_at,
    last_error = NULL;

  RAISE NOTICE 'Go-live reset complete:';
  RAISE NOTICE '  delivery_routing_events deleted: %', v_routing;
  RAISE NOTICE '  delivery_ledger_lines deleted: %', v_ledger;
  RAISE NOTICE '  customer_notifications deleted: %', v_notifications;
  RAISE NOTICE '  customer_leads deleted: %', v_customer_leads;
  RAISE NOTICE '  leads (inventory) deleted: %', v_leads;
  RAISE NOTICE '  organization_free_delivery rows deleted: %', v_free_delivery;
  RAISE NOTICE '  routing_job_runs deleted: %', v_job_runs;
  RAISE NOTICE '  external_sync_exclusions deleted: %', v_exclusions;
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
