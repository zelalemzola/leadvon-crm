-- Track outbound Google Sheet appends so delivery side-effects are idempotent.
-- Never delete customer_leads rows from sheets; this table only records successful appends.

CREATE TABLE IF NOT EXISTS public.google_sheet_lead_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  customer_lead_id uuid NOT NULL REFERENCES public.customer_leads (id) ON DELETE CASCADE,
  spreadsheet_id text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now (),
  created_at timestamptz NOT NULL DEFAULT now (),
  CONSTRAINT google_sheet_lead_exports_customer_lead_id_key UNIQUE (customer_lead_id)
);

CREATE INDEX IF NOT EXISTS idx_google_sheet_lead_exports_org_synced
  ON public.google_sheet_lead_exports (organization_id, synced_at DESC);

ALTER TABLE public.google_sheet_lead_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY google_sheet_lead_exports_staff_select ON public.google_sheet_lead_exports
  FOR SELECT TO authenticated
  USING (public.is_staff ());

-- Pending deliveries for outbound sheet sync (service role / staff).
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
    created_at timestamptz
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
    cl.created_at
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
