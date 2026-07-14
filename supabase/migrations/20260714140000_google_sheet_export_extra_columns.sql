-- Extend pending Google Sheet export rows with optional right-side columns.

CREATE OR REPLACE FUNCTION public.list_pending_google_sheet_lead_exports (
  p_organization_id uuid,
  p_limit integer DEFAULT 100
)
  RETURNS TABLE (
    id uuid,
    organization_id uuid,
    first_name text,
    last_name text,
    phone text,
    created_at timestamptz,
    zip_code text,
    summary text,
    lead_unit_type text,
    country text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
  SELECT
    cl.id,
    cl.organization_id,
    cl.first_name,
    cl.last_name,
    cl.phone,
    cl.created_at,
    cl.zip_code,
    cl.summary,
    cl.lead_unit_type::text,
    cl.country
  FROM
    public.customer_leads cl
  WHERE
    cl.organization_id = p_organization_id
    AND NOT EXISTS (
      SELECT
        1
      FROM
        public.google_sheet_lead_exports e
      WHERE
        e.customer_lead_id = cl.id)
  ORDER BY
    cl.created_at ASC
  LIMIT GREATEST (COALESCE(p_limit, 100), 1);
$$;

REVOKE ALL ON FUNCTION public.list_pending_google_sheet_lead_exports (uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_pending_google_sheet_lead_exports (uuid, integer) TO service_role;
