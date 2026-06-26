-- One-time: remove magalela's prior uncapped free-delivery leads and reset campaign counters.
-- Run in Supabase SQL Editor before enabling the new 10-lead campaigns.
-- Does NOT return old sold inventory to the pool (those leads stay consumed).

DO $$
DECLARE
  v_magalela_id uuid;
  v_removed integer;
BEGIN
  SELECT id INTO v_magalela_id
  FROM public.organizations
  WHERE name ILIKE '%magalela%'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_magalela_id IS NULL THEN
    RAISE EXCEPTION 'magalela organization not found';
  END IF;

  DELETE FROM public.customer_leads
  WHERE organization_id = v_magalela_id
    AND grant_source = 'free_delivery';

  GET DIAGNOSTICS v_removed = ROW_COUNT;

  UPDATE public.organization_free_delivery
  SET
    quota_delivered = 0,
    quota_total = 0,
    is_active = FALSE,
    eligible_from = date_trunc('day', (now() AT TIME ZONE 'UTC')) AT TIME ZONE 'UTC'
  WHERE organization_id = v_magalela_id;

  RAISE NOTICE 'Removed % free-delivery customer leads for magalela (org %)', v_removed, v_magalela_id;
END;
$$;

-- Optional: reset Loan World counters only (keeps any existing free leads on their account).
-- Uncomment if you also need a clean slate there before the new campaign.
/*
UPDATE public.organization_free_delivery d
SET
  quota_delivered = 0,
  is_active = FALSE,
  eligible_from = date_trunc('day', (now() AT TIME ZONE 'UTC')) AT TIME ZONE 'UTC'
FROM public.organizations o
WHERE d.organization_id = o.id
  AND o.name ILIKE '%loan world%';
*/
