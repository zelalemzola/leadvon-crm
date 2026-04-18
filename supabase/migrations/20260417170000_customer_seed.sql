-- Seed starter customer data for MVP testing:
-- categories, lead packages, optional offers, and unsold inventory leads.

INSERT INTO public.categories (name, slug)
VALUES
  ('Health Insurance', 'health-insurance'),
  ('Life Insurance', 'life-insurance'),
  ('Auto Insurance', 'auto-insurance'),
  ('Debt Relief', 'debt-relief')
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name;

WITH c AS (
  SELECT id, slug
  FROM public.categories
),
pkg_seed AS (
  SELECT * FROM (
    VALUES
      ('Starter Health 20', 'health-insurance', '20 health leads', 5000, 20),
      ('Growth Health 50', 'health-insurance', '50 health leads', 11500, 50),
      ('Starter Life 20', 'life-insurance', '20 life leads', 5200, 20),
      ('Starter Auto 20', 'auto-insurance', '20 auto leads', 4800, 20),
      ('Starter Debt 20', 'debt-relief', '20 debt relief leads', 5600, 20)
  ) AS v(name, slug, description, price_cents, leads_count)
)
INSERT INTO public.lead_packages (category_id, name, description, price_cents, currency, leads_count, active)
SELECT c.id, s.name, s.description, s.price_cents, 'USD', s.leads_count, true
FROM pkg_seed s
JOIN c ON c.slug = s.slug
WHERE NOT EXISTS (
  SELECT 1
  FROM public.lead_packages lp
  WHERE lp.category_id = c.id
    AND lp.name = s.name
);

WITH package_targets AS (
  SELECT lp.id AS package_id
  FROM public.lead_packages lp
  WHERE lp.name IN ('Starter Health 20', 'Starter Life 20')
),
offer_seed AS (
  SELECT * FROM (
    VALUES
      ('Starter Health 20', 'Welcome Offer - Health', 'First campaign discount', 10.00),
      ('Starter Life 20', 'Launch Offer - Life', 'Limited launch discount', 8.00)
  ) AS v(package_name, title, description, discount_percent)
)
INSERT INTO public.lead_offers (
  package_id,
  title,
  description,
  discount_percent,
  starts_at,
  ends_at,
  active
)
SELECT
  lp.id,
  o.title,
  o.description,
  o.discount_percent,
  now() - interval '1 day',
  now() + interval '45 day',
  true
FROM offer_seed o
JOIN public.lead_packages lp ON lp.name = o.package_name
WHERE NOT EXISTS (
  SELECT 1
  FROM public.lead_offers lo
  WHERE lo.package_id = lp.id
    AND lo.title = o.title
);

-- Seed unsold inventory leads (200 total, 50 per category) for package purchases.
WITH category_targets AS (
  SELECT id, slug
  FROM public.categories
  WHERE slug IN ('health-insurance', 'life-insurance', 'auto-insurance', 'debt-relief')
),
seed_rows AS (
  SELECT
    ct.id AS category_id,
    ct.slug,
    gs AS n
  FROM category_targets ct
  CROSS JOIN generate_series(1, 50) AS gs
)
INSERT INTO public.leads (category_id, phone, first_name, last_name, notes, sold_at)
SELECT
  s.category_id,
  '+1555' || lpad((2000000 + (abs(hashtext(s.slug)) % 500000) + s.n)::text, 7, '0') AS phone,
  initcap(split_part(replace(s.slug, '-', ' '), ' ', 1)) || 'Lead' AS first_name,
  lpad(s.n::text, 3, '0') AS last_name,
  'Seeded lead for ' || s.slug || ' #' || s.n AS notes,
  NULL
FROM seed_rows s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.leads l
  WHERE l.category_id = s.category_id
    AND l.notes = ('Seeded lead for ' || s.slug || ' #' || s.n)
);
