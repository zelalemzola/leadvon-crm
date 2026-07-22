-- =============================================================================
-- CLEANUP — remove pre-today Base44 leads that only synced because gates were
-- temporarily relaxed (status/phone/name), block re-fetch, revoke client copies,
-- and restore free-delivery quotas (esp. My Debt Hero).
-- =============================================================================
-- Run in the Supabase SQL Editor.
--
-- Target rows (ALL must match):
--   * source_system = 'base44'
--   * source_created_at < start of today (UTC)
--   * fails at least one normal gate:
--       - empty phone, OR
--       - empty first+last name, OR
--       - source_payload.status is not 'new' (missing/blank/other)
--
-- Today's Base44 leads are left alone (gates may stay relaxed for today only).
-- =============================================================================

BEGIN;

CREATE TEMP TABLE tmp_old_relaxed_base44_leads ON COMMIT DROP AS
SELECT
  l.id,
  l.source_system,
  l.source_external_id,
  l.source_created_at
FROM public.leads l
WHERE l.source_system = 'base44'
  AND COALESCE(l.source_created_at, l.created_at) < date_trunc(
    'day',
    (now() AT TIME ZONE 'UTC')
  ) AT TIME ZONE 'UTC'
  AND (
    btrim(COALESCE(l.phone, '')) = ''
    OR (
      btrim(COALESCE(l.first_name, '')) = ''
      AND btrim(COALESCE(l.last_name, '')) = ''
    )
    OR lower(btrim(COALESCE(l.source_payload ->> 'status', ''))) <> 'new'
  );

CREATE TEMP TABLE tmp_old_relaxed_customer_leads ON COMMIT DROP AS
SELECT
  cl.id,
  cl.organization_id,
  cl.grant_source,
  cl.source_lead_id
FROM public.customer_leads cl
JOIN tmp_old_relaxed_base44_leads t ON t.id = cl.source_lead_id;

DO $$
DECLARE
  v_target_total integer;
  v_excluded integer;
  v_notifications integer;
  v_routing integer;
  v_customer_leads integer;
  v_free_delivery_revoked integer;
  v_deleted integer;
  r record;
BEGIN
  SELECT count(*) INTO v_target_total FROM tmp_old_relaxed_base44_leads;

  -- 1) Never re-fetch these Base44 ids.
  INSERT INTO public.external_sync_exclusions (provider, external_id, reason)
  SELECT
    t.source_system,
    t.source_external_id,
    'temp_relaxed_gates_pre_today_cleanup'
  FROM tmp_old_relaxed_base44_leads t
  WHERE t.source_external_id IS NOT NULL
  ON CONFLICT (provider, external_id) DO UPDATE
  SET reason = EXCLUDED.reason,
      updated_at = now();
  GET DIAGNOSTICS v_excluded = ROW_COUNT;

  -- 2) Unwind deliveries (FK-safe).
  DELETE FROM public.customer_notifications n
  WHERE n.entity_type = 'customer_lead'
    AND n.entity_id IN (SELECT id FROM tmp_old_relaxed_customer_leads);
  GET DIAGNOSTICS v_notifications = ROW_COUNT;

  DELETE FROM public.delivery_routing_events dre
  WHERE dre.source_lead_id IN (SELECT id FROM tmp_old_relaxed_base44_leads);
  GET DIAGNOSTICS v_routing = ROW_COUNT;

  SELECT count(*) INTO v_free_delivery_revoked
  FROM tmp_old_relaxed_customer_leads
  WHERE grant_source = 'free_delivery';

  DELETE FROM public.customer_leads cl
  WHERE cl.id IN (SELECT id FROM tmp_old_relaxed_customer_leads);
  GET DIAGNOSTICS v_customer_leads = ROW_COUNT;

  DELETE FROM public.leads l
  WHERE l.id IN (SELECT id FROM tmp_old_relaxed_base44_leads);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- 3) Fix free-delivery counters for every affected org and re-open if under quota.
  FOR r IN
    SELECT
      organization_id,
      count(*) FILTER (WHERE grant_source = 'free_delivery') AS free_revoked
    FROM tmp_old_relaxed_customer_leads
    GROUP BY organization_id
  LOOP
    UPDATE public.organization_free_delivery d
    SET
      quota_delivered = GREATEST(0, d.quota_delivered - r.free_revoked::integer),
      is_active = CASE
        WHEN d.quota_total > 0
          AND GREATEST(0, d.quota_delivered - r.free_revoked::integer) < d.quota_total
        THEN TRUE
        ELSE d.is_active
      END,
      distribute_after = now()
    WHERE d.organization_id = r.organization_id;
  END LOOP;

  RAISE NOTICE 'Old relaxed-gate base44 leads targeted: %', v_target_total;
  RAISE NOTICE 'External ids blocked from re-sync: %', v_excluded;
  RAISE NOTICE 'Notifications removed: %', v_notifications;
  RAISE NOTICE 'Routing events removed: %', v_routing;
  RAISE NOTICE 'Customer lead copies removed: %', v_customer_leads;
  RAISE NOTICE 'Of which free_delivery: %', v_free_delivery_revoked;
  RAISE NOTICE 'Source leads deleted: %', v_deleted;
END;
$$;

COMMIT;

-- Verification
SELECT
  o.name,
  d.quota_delivered,
  d.quota_total,
  d.is_active,
  d.distribute_after
FROM public.organization_free_delivery d
JOIN public.organizations o ON o.id = d.organization_id
WHERE o.name ILIKE '%debt%hero%';

SELECT count(*) AS remaining_old_relaxed_base44_leads
FROM public.leads l
WHERE l.source_system = 'base44'
  AND COALESCE(l.source_created_at, l.created_at) < date_trunc(
    'day',
    (now() AT TIME ZONE 'UTC')
  ) AT TIME ZONE 'UTC'
  AND (
    btrim(COALESCE(l.phone, '')) = ''
    OR (
      btrim(COALESCE(l.first_name, '')) = ''
      AND btrim(COALESCE(l.last_name, '')) = ''
    )
    OR lower(btrim(COALESCE(l.source_payload ->> 'status', ''))) <> 'new'
  );
