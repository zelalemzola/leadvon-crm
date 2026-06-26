-- Mark inventory available again when leads are sold but no customer owns them.
-- Use after revoking free-delivery leads if customer_leads were removed first.

UPDATE public.leads l
SET sold_at = NULL
WHERE l.sold_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.customer_leads cl
    WHERE cl.source_lead_id = l.id
  );

-- Shows how many rows were fixed (run SELECT after UPDATE if your client does not return row count).
SELECT COUNT(*) AS still_sold_without_customer
FROM public.leads l
WHERE l.sold_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.customer_leads cl
    WHERE cl.source_lead_id = l.id
  );
