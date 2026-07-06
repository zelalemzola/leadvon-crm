-- Emergency: return VacsSA free-delivery leads to inventory and stop delivery.
-- Safe to re-run (no-op when no free_delivery customer_leads remain).

DO $$
DECLARE
  v_org_id uuid;
  v_removed integer;
  v_returned integer;
BEGIN
  SELECT id INTO v_org_id
  FROM public.organizations
  WHERE name ILIKE '%vacssa%'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'VacsSA organization not found';
  END IF;

  UPDATE public.leads l
  SET sold_at = NULL
  FROM public.customer_leads cl
  WHERE cl.organization_id = v_org_id
    AND cl.grant_source = 'free_delivery'
    AND l.id = cl.source_lead_id;

  GET DIAGNOSTICS v_returned = ROW_COUNT;

  DELETE FROM public.customer_notifications n
  USING public.customer_leads cl
  WHERE cl.organization_id = v_org_id
    AND cl.grant_source = 'free_delivery'
    AND n.entity_type = 'customer_lead'
    AND n.entity_id = cl.id;

  DELETE FROM public.customer_leads
  WHERE organization_id = v_org_id
    AND grant_source = 'free_delivery';

  GET DIAGNOSTICS v_removed = ROW_COUNT;

  UPDATE public.organization_free_delivery d
  SET
    quota_delivered = GREATEST(0, d.quota_delivered - v_removed),
    is_active = FALSE
  WHERE d.organization_id = v_org_id;

  RAISE NOTICE 'Revoked % free-delivery customer leads; returned % source leads (org %)',
    v_removed, v_returned, v_org_id;
END;
$$;
