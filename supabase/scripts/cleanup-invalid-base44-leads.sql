-- =============================================================================
-- CLEANUP — remove Base44 leads ingested by mistake (missing phone / name)
-- =============================================================================
-- Run in the Supabase SQL Editor.
--
-- Context: for a short window the Base44 ingestion accepted `status = new` leads
-- WITHOUT requiring a phone number or a name. The correct rule is: a lead must
-- have a phone number AND at least one of first name / last name. This script
-- removes the bad rows that slipped in, INCLUDING ones that were already
-- auto-delivered/sold to customers (those junk leads have no phone/name and are
-- worthless to customers anyway).
--
-- What it does:
--   1. Finds every base44 lead that is invalid under the new rule
--      (empty phone, OR empty first AND empty last name).
--   2. Permanently blocks their external ids from ever syncing back in
--      (external_sync_exclusions), so the background job never re-fetches them
--      even if their `status` stays `new` in Base44.
--   3. Unwinds their delivery records in FK-safe order (routing events →
--      customer_leads), then deletes the leads themselves. Ledger lines keep
--      their financial record (customer_lead_id is set to NULL, not deleted).
--
-- Safety:
--   * Only touches source_system = 'base44'.
--   * Only rows that fail the new validity rule are affected — valid leads with a
--     phone + a name are never touched.
-- =============================================================================

BEGIN;

-- 1. Invalid base44 leads (sold or not).
CREATE TEMP TABLE tmp_invalid_base44_leads ON COMMIT DROP AS
SELECT
  l.id,
  l.source_system,
  l.source_external_id
FROM public.leads l
WHERE l.source_system = 'base44'
  AND (
    btrim(COALESCE(l.phone, '')) = ''
    OR (btrim(COALESCE(l.first_name, '')) = '' AND btrim(COALESCE(l.last_name, '')) = '')
  );

-- Customer copies delivered from those invalid source leads.
CREATE TEMP TABLE tmp_invalid_customer_leads ON COMMIT DROP AS
SELECT cl.id
FROM public.customer_leads cl
JOIN tmp_invalid_base44_leads t ON t.id = cl.source_lead_id;

DO $$
DECLARE
  v_invalid_total integer;
  v_excluded integer;
  v_notifications integer;
  v_routing integer;
  v_customer_leads integer;
  v_deleted integer;
BEGIN
  SELECT count(*) INTO v_invalid_total FROM tmp_invalid_base44_leads;

  -- 2. Never fetch these external ids again.
  INSERT INTO public.external_sync_exclusions (provider, external_id, reason)
  SELECT t.source_system, t.source_external_id, 'invalid_missing_phone_or_name'
  FROM tmp_invalid_base44_leads t
  WHERE t.source_external_id IS NOT NULL
  ON CONFLICT (provider, external_id) DO NOTHING;
  GET DIAGNOSTICS v_excluded = ROW_COUNT;

  -- 3. Unwind delivery records for the invalid leads (FK-safe order).
  DELETE FROM public.customer_notifications n
  WHERE n.entity_type = 'customer_lead'
    AND n.entity_id IN (SELECT id FROM tmp_invalid_customer_leads);
  GET DIAGNOSTICS v_notifications = ROW_COUNT;

  DELETE FROM public.delivery_routing_events dre
  WHERE dre.source_lead_id IN (SELECT id FROM tmp_invalid_base44_leads);
  GET DIAGNOSTICS v_routing = ROW_COUNT;

  DELETE FROM public.customer_leads cl
  WHERE cl.source_lead_id IN (SELECT id FROM tmp_invalid_base44_leads);
  GET DIAGNOSTICS v_customer_leads = ROW_COUNT;

  DELETE FROM public.leads l
  WHERE l.id IN (SELECT id FROM tmp_invalid_base44_leads);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RAISE NOTICE 'Invalid base44 leads found: %', v_invalid_total;
  RAISE NOTICE 'External ids blocked from re-sync: %', v_excluded;
  RAISE NOTICE 'Notifications removed: %', v_notifications;
  RAISE NOTICE 'Routing events removed: %', v_routing;
  RAISE NOTICE 'Customer lead copies removed: %', v_customer_leads;
  RAISE NOTICE 'Source leads deleted: %', v_deleted;
END;
$$;

COMMIT;

-- Post-run verification: should return 0 rows.
SELECT count(*) AS remaining_invalid_base44_leads
FROM public.leads l
WHERE l.source_system = 'base44'
  AND (
    btrim(COALESCE(l.phone, '')) = ''
    OR (btrim(COALESCE(l.first_name, '')) = '' AND btrim(COALESCE(l.last_name, '')) = '')
  );
