-- Return magalela's current free-delivery campaign leads to admin inventory and reset counters.
-- Prerequisite: run migration 20260626130000_free_delivery_distribution_delay.sql first.
-- Then re-enable free delivery for magalela + Loan World within 5 minutes of each other.

DO $$
DECLARE
  v_magalela_id uuid;
  v_removed integer;
  v_returned integer;
  v_orphaned integer;
BEGIN
  SELECT id INTO v_magalela_id
  FROM public.organizations
  WHERE name ILIKE '%magalela%'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_magalela_id IS NULL THEN
    RAISE EXCEPTION 'magalela organization not found';
  END IF;

  -- Unsell while customer_leads still exist (normal path).
  UPDATE public.leads l
  SET sold_at = NULL
  FROM public.customer_leads cl
  WHERE cl.organization_id = v_magalela_id
    AND cl.grant_source = 'free_delivery'
    AND l.id = cl.source_lead_id;

  GET DIAGNOSTICS v_returned = ROW_COUNT;

  DELETE FROM public.customer_leads
  WHERE organization_id = v_magalela_id
    AND grant_source = 'free_delivery';

  GET DIAGNOSTICS v_removed = ROW_COUNT;

  -- If customer_leads were already removed, still return orphaned sold inventory.
  UPDATE public.leads l
  SET sold_at = NULL
  WHERE l.sold_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.customer_leads cl
      WHERE cl.source_lead_id = l.id
    );

  GET DIAGNOSTICS v_orphaned = ROW_COUNT;
  v_returned := v_returned + v_orphaned;

  UPDATE public.organization_free_delivery d
  SET
    quota_delivered = GREATEST(0, d.quota_delivered - v_removed),
    is_active = CASE
      WHEN d.quota_total > 0 AND GREATEST(0, d.quota_delivered - v_removed) < d.quota_total THEN TRUE
      ELSE d.is_active
    END,
    distribute_after = now() + interval '5 minutes'
  WHERE d.organization_id = v_magalela_id;

  RAISE NOTICE 'Revoked % free-delivery customer leads; returned % source leads to inventory (org %)',
    v_removed, v_returned, v_magalela_id;
END;
$$;
