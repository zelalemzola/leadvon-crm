-- Tier 1 admin dashboard: date range, category, country, availability on lead analytics.
-- Rolling window (p_days_back) applies when p_date_from/p_date_to are both NULL.
--
-- `leads.country` is added in 20260418150000_lead_country.sql; repeat here so this
-- migration is safe to run alone in the SQL editor without that file.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT '';

DROP FUNCTION IF EXISTS public.admin_leads_created_by_day (integer);

DROP FUNCTION IF EXISTS public.admin_leads_by_category ();

CREATE OR REPLACE FUNCTION public.admin_leads_created_by_day (
  p_days_back integer DEFAULT 30,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_filter_category_id uuid DEFAULT NULL,
  p_country_subtext text DEFAULT NULL,
  p_availability text DEFAULT 'all'
)
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
  WHERE ((
      p_date_from IS NOT NULL
      AND p_date_to IS NOT NULL
      AND l.created_at >= (p_date_from::timestamp AT TIME ZONE 'UTC')
      AND l.created_at < ((p_date_to + 1)::timestamp AT TIME ZONE 'UTC'))
    OR (
      (p_date_from IS NULL
        OR p_date_to IS NULL)
      AND l.created_at >= (now() - (p_days_back || ' days')::interval)))
  AND (p_filter_category_id IS NULL
    OR l.category_id = p_filter_category_id)
  AND (p_country_subtext IS NULL
    OR trim(p_country_subtext) = ''
    OR l.country ILIKE '%' || trim(p_country_subtext) || '%')
  AND (p_availability = 'all'
    OR (p_availability = 'available'
      AND l.sold_at IS NULL)
    OR (p_availability = 'sold'
      AND l.sold_at IS NOT NULL))
GROUP BY
  1
ORDER BY
  1;
$$;

CREATE OR REPLACE FUNCTION public.admin_leads_by_category (
  p_days_back integer DEFAULT 30,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_filter_category_id uuid DEFAULT NULL,
  p_country_subtext text DEFAULT NULL,
  p_availability text DEFAULT 'all'
)
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
  SELECT
    c.id,
    c.name,
    c.slug,
    count(l.id)::bigint AS lead_count,
    count(l.id) FILTER (
      WHERE l.sold_at IS NULL)::bigint AS unsold_count
  FROM public.categories c
    LEFT JOIN public.leads l ON l.category_id = c.id
      AND ((
          p_date_from IS NOT NULL
          AND p_date_to IS NOT NULL
          AND l.created_at >= (p_date_from::timestamp AT TIME ZONE 'UTC')
          AND l.created_at < ((p_date_to + 1)::timestamp AT TIME ZONE 'UTC'))
        OR (
          (p_date_from IS NULL
            OR p_date_to IS NULL)
          AND l.created_at >= (now() - (p_days_back || ' days')::interval)))
      AND (p_country_subtext IS NULL
        OR trim(p_country_subtext) = ''
        OR l.country ILIKE '%' || trim(p_country_subtext) || '%')
      AND (p_availability = 'all'
        OR (p_availability = 'available'
          AND l.sold_at IS NULL)
        OR (p_availability = 'sold'
          AND l.sold_at IS NOT NULL))
      AND (p_filter_category_id IS NULL
        OR l.category_id = p_filter_category_id)
  WHERE (p_filter_category_id IS NULL
    OR c.id = p_filter_category_id)
GROUP BY
  c.id,
  c.name,
  c.slug
ORDER BY
  c.name;
$$;

GRANT EXECUTE ON FUNCTION public.admin_leads_created_by_day (integer, date, date, uuid, text, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.admin_leads_by_category (integer, date, date, uuid, text, text) TO authenticated;
