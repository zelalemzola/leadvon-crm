-- Revoke today's free-delivery campaign leads from Loan World + magalela,
-- return source leads to admin inventory, and reset campaign counters.
-- Use before re-enabling both customers within the same 5-minute window.

DO $$
DECLARE
  v_removed integer;
  v_returned integer;
BEGIN
  CREATE TEMP TABLE _campaign_revoked ON COMMIT DROP AS
  SELECT
    cl.id AS customer_lead_id,
    cl.source_lead_id,
    cl.organization_id
  FROM public.customer_leads cl
  INNER JOIN public.organization_free_delivery d
    ON d.organization_id = cl.organization_id
  INNER JOIN public.organizations o
    ON o.id = cl.organization_id
  WHERE cl.grant_source = 'free_delivery'
    AND d.eligible_from = date_trunc('day', (now() AT TIME ZONE 'UTC')) AT TIME ZONE 'UTC'
    AND o.name ILIKE ANY (ARRAY['%magalela%', '%loan world%']);

  UPDATE public.leads l
  SET sold_at = NULL
  FROM _campaign_revoked r
  WHERE l.id = r.source_lead_id;

  GET DIAGNOSTICS v_returned = ROW_COUNT;

  DELETE FROM public.customer_leads cl
  USING _campaign_revoked r
  WHERE cl.id = r.customer_lead_id;

  GET DIAGNOSTICS v_removed = ROW_COUNT;

  UPDATE public.organization_free_delivery d
  SET
    quota_delivered = GREATEST(
      0,
      d.quota_delivered - COALESCE((
        SELECT COUNT(*)
        FROM _campaign_revoked r
        WHERE r.organization_id = d.organization_id
      ), 0)
    ),
    is_active = CASE
      WHEN d.quota_total > 0
        AND GREATEST(
          0,
          d.quota_delivered - COALESCE((
            SELECT COUNT(*)
            FROM _campaign_revoked r
            WHERE r.organization_id = d.organization_id
          ), 0)
        ) < d.quota_total THEN TRUE
      ELSE d.is_active
    END,
    distribute_after = now() + interval '5 minutes'
  WHERE d.organization_id IN (
    SELECT DISTINCT organization_id FROM _campaign_revoked
  );

  RAISE NOTICE 'Revoked % free-delivery leads; returned % source leads to inventory',
    v_removed, v_returned;
END;
$$;
