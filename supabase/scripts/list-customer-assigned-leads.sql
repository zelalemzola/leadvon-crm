-- List assigned leads for magalela + Loan World (paid + free delivery + signup free).
-- To narrow to one org, change the WHERE filter at the bottom.

SELECT
  o.name AS organization,
  cl.grant_source,
  cl.first_name,
  cl.last_name,
  cl.phone,
  cl.country,
  c.name AS category,
  cl.created_at AS assigned_at,
  cl.source_lead_id,
  cl.id AS customer_lead_id
FROM public.customer_leads cl
INNER JOIN public.organizations o
  ON o.id = cl.organization_id
LEFT JOIN public.categories c
  ON c.id = cl.category_id
WHERE o.name ILIKE ANY (ARRAY['%magalela%', '%loan world%'])
  AND cl.grant_source = 'free_delivery'
  AND cl.created_at >= date_trunc('day', (now() AT TIME ZONE 'UTC')) AT TIME ZONE 'UTC'
ORDER BY o.name ASC, cl.created_at DESC;

-- All assigned leads for one org only:
-- WHERE o.name ILIKE '%magalela%'

-- All assigned leads (any org, any source):
-- (remove the WHERE clause above)
