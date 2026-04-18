-- LeadVon admin schema: staff inventory, categories, packages, profiles with RLS.
--
-- After running this migration, sign up once (e.g. /login), then promote your user:
--   UPDATE public.profiles SET role = 'staff' WHERE email = 'your@email.com';
-- Add SUPABASE_SERVICE_ROLE_KEY to .env.local for /admin/staff user creation.

-- Roles for platform users (customer roles reserved for later phases)
CREATE TYPE public.user_role AS ENUM (
  'staff',
  'customer_admin',
  'customer_agent'
);

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  role public.user_role NOT NULL DEFAULT 'customer_admin',
  email text,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_org ON public.profiles (organization_id);
CREATE INDEX idx_profiles_role ON public.profiles (role);

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Staff-owned lead inventory (sold copies to customers will be a separate table later)
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  category_id uuid NOT NULL REFERENCES public.categories (id) ON DELETE RESTRICT,
  phone text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sold_at timestamptz
);

CREATE INDEX idx_leads_category ON public.leads (category_id);
CREATE INDEX idx_leads_created ON public.leads (created_at DESC);
CREATE INDEX idx_leads_sold ON public.leads (sold_at);

CREATE TABLE public.lead_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  category_id uuid NOT NULL REFERENCES public.categories (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  currency text NOT NULL DEFAULT 'USD',
  leads_count integer NOT NULL CHECK (leads_count > 0),
  stripe_price_id text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_packages_category ON public.lead_packages (category_id);

-- Staff check (SECURITY DEFINER: avoid RLS recursion on profiles)
CREATE OR REPLACE FUNCTION public.is_staff ()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid ()
      AND p.role = 'staff');
$$;

GRANT EXECUTE ON FUNCTION public.is_staff () TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff () TO service_role;

-- New auth users → profile row (role from server-set app_metadata when present)
CREATE OR REPLACE FUNCTION public.handle_new_user ()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  r public.user_role;
BEGIN
  IF NEW.raw_app_meta_data IS NOT NULL
    AND NEW.raw_app_meta_data ->> 'role' IN ('staff', 'customer_admin', 'customer_agent') THEN
    r := (NEW.raw_app_meta_data ->> 'role')::public.user_role;
  ELSE
    r := 'customer_admin';
  END IF;

  INSERT INTO public.profiles (id, role, email, full_name)
    VALUES (NEW.id, r, NEW.email, COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user ();

-- updated_at touch
CREATE OR REPLACE FUNCTION public.set_updated_at ()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

CREATE TRIGGER lead_packages_updated_at
  BEFORE UPDATE ON public.lead_packages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

-- RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_packages ENABLE ROW LEVEL SECURITY;

-- organizations: staff only for v1
CREATE POLICY organizations_staff_all ON public.organizations
  FOR ALL TO authenticated
  USING (public.is_staff ())
  WITH CHECK (public.is_staff ());

CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid () = id OR public.is_staff ());

CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid () = id OR public.is_staff ())
  WITH CHECK (auth.uid () = id OR public.is_staff ());

CREATE POLICY categories_staff_all ON public.categories
  FOR ALL TO authenticated
  USING (public.is_staff ())
  WITH CHECK (public.is_staff ());

CREATE POLICY leads_staff_all ON public.leads
  FOR ALL TO authenticated
  USING (public.is_staff ())
  WITH CHECK (public.is_staff ());

CREATE POLICY lead_packages_staff_all ON public.lead_packages
  FOR ALL TO authenticated
  USING (public.is_staff ())
  WITH CHECK (public.is_staff ());

-- Analytics helpers (RLS applies via SECURITY INVOKER)
CREATE OR REPLACE FUNCTION public.admin_leads_created_by_day (days_back integer DEFAULT 30)
  RETURNS TABLE (
    day date,
    count bigint)
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = public
  AS $$
  SELECT date_trunc('day', l.created_at)::date AS day,
    count(*)::bigint AS count
  FROM public.leads l
  WHERE l.created_at >= (now() - (days_back || ' days')::interval)
  GROUP BY 1
  ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION public.admin_leads_created_by_day (integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_leads_by_category ()
  RETURNS TABLE (
    category_id uuid,
    category_name text,
    slug text,
    lead_count bigint,
    unsold_count bigint)
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = public
  AS $$
  SELECT c.id,
    c.name,
    c.slug,
    count(l.*)::bigint AS lead_count,
    count(l.*) FILTER (
      WHERE l.sold_at IS NULL)::bigint AS unsold_count
  FROM public.categories c
    LEFT JOIN public.leads l ON l.category_id = c.id
  GROUP BY c.id,
    c.name,
    c.slug
  ORDER BY c.name;
$$;

GRANT EXECUTE ON FUNCTION public.admin_leads_by_category () TO authenticated;
