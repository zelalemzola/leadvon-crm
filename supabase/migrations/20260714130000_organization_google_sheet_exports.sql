-- Per-organization Google Sheets outbound lead export settings.

CREATE TABLE IF NOT EXISTS public.organization_google_sheet_exports (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT false,
  spreadsheet_id text NOT NULL DEFAULT '',
  sheet_name text NOT NULL DEFAULT 'Leads',
  last_synced_at timestamptz,
  last_error text,
  activated_at timestamptz,
  activated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now (),
  updated_at timestamptz NOT NULL DEFAULT now (),
  CONSTRAINT organization_google_sheet_exports_sheet_name_check CHECK (
    char_length(trim(sheet_name)) BETWEEN 1 AND 120
  )
);

CREATE INDEX IF NOT EXISTS idx_organization_google_sheet_exports_active
  ON public.organization_google_sheet_exports (organization_id)
  WHERE is_active = true;

ALTER TABLE public.organization_google_sheet_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY organization_google_sheet_exports_staff_all ON public.organization_google_sheet_exports
  FOR ALL TO authenticated
  USING (public.is_staff ())
  WITH CHECK (public.is_staff ());

CREATE POLICY organization_google_sheet_exports_org_select ON public.organization_google_sheet_exports
  FOR SELECT TO authenticated
  USING (organization_id = public.user_org_id ());
