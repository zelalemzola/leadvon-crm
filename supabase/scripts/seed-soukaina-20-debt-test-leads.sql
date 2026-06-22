-- Seed 20 Debt Review test leads and deliver them to Soukaina's organization.
-- Safe to re-run: skips if leads tagged [TEST-SEED-SOUKAINA] already exist.
--
-- Run in Supabase SQL Editor (service role / postgres).

-- Schema repair: notification trigger expects these columns on customer_leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT '';

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS zip_code text;

ALTER TABLE public.customer_leads
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT '';

ALTER TABLE public.customer_leads
  ADD COLUMN IF NOT EXISTS zip_code text;

DO $$
DECLARE
  v_org_id uuid;
  v_category_id uuid;
  v_lead_id uuid;
  v_n integer;
  v_summary text;
  v_salary text;
  v_debt text;
  v_phone text;
  v_delivered integer := 0;
  v_quota_delivered integer;
  v_assignee uuid;
  v_has_free_test_fn boolean;
  v_has_prepaid_fn boolean;
  v_has_grant_source boolean;
  v_has_free_test_alloc boolean;
BEGIN
  -- Resolve Soukaina's organization
  SELECT o.id INTO v_org_id
  FROM public.organizations o
  LEFT JOIN public.profiles p ON p.organization_id = o.id
  WHERE p.email ILIKE 'soukaina@leadvon.com'
     OR o.name ILIKE '%Soukaina%'
     OR o.id::text ILIKE 'ff12ff41%'
  ORDER BY
    CASE WHEN p.email ILIKE 'soukaina@leadvon.com' THEN 0 ELSE 1 END,
    o.created_at DESC
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization not found for Soukaina. Check name/email and re-run.';
  END IF;

  -- Ensure Debt Review category exists (migration may not have been applied yet)
  INSERT INTO public.categories (name, slug)
  VALUES ('Debt Review', 'debt-review')
  ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name;

  SELECT id INTO v_category_id
  FROM public.categories
  WHERE slug = 'debt-review'
  LIMIT 1;

  -- Fallback for older databases that still use debt-relief
  IF v_category_id IS NULL THEN
    SELECT id INTO v_category_id
    FROM public.categories
    WHERE slug = 'debt-relief'
    LIMIT 1;
  END IF;

  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'No debt category found. Create one in Admin → Categories first.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'deliver_free_test_lead'
  ) INTO v_has_free_test_fn;

  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'deliver_lead_from_prepaid_budget'
  ) INTO v_has_prepaid_fn;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_leads'
      AND column_name = 'grant_source'
  ) INTO v_has_grant_source;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'organization_free_test_allocations'
  ) INTO v_has_free_test_alloc;

  IF EXISTS (
    SELECT 1
    FROM public.customer_leads
    WHERE summary LIKE '%[TEST-SEED-SOUKAINA]%'
  ) THEN
    RAISE NOTICE 'Test leads already seeded for Soukaina — skipping.';
    RETURN;
  END IF;

  -- Remove orphaned inventory from a failed prior run
  DELETE FROM public.leads l
  WHERE l.summary LIKE '%[TEST-SEED-SOUKAINA]%'
    AND l.sold_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.customer_leads cl
      WHERE cl.source_lead_id = l.id
    );

  -- Free-test path: ensure quota when the table exists
  IF v_has_free_test_fn AND v_has_free_test_alloc THEN
    SELECT COALESCE(quota_delivered, 0) INTO v_quota_delivered
    FROM public.organization_free_test_allocations
    WHERE organization_id = v_org_id;

    INSERT INTO public.organization_free_test_allocations (
      organization_id,
      quota_total,
      quota_delivered,
      is_active,
      activated_at
    )
    VALUES (
      v_org_id,
      COALESCE(v_quota_delivered, 0) + 20,
      COALESCE(v_quota_delivered, 0),
      TRUE,
      now()
    )
    ON CONFLICT (organization_id) DO UPDATE
    SET
      quota_total = GREATEST(
        public.organization_free_test_allocations.quota_total,
        public.organization_free_test_allocations.quota_delivered + 20
      ),
      is_active = TRUE,
      activated_at = COALESCE(public.organization_free_test_allocations.activated_at, now()),
      updated_at = now();
  END IF;

  FOR v_n IN 1..20 LOOP
    CASE (v_n - 1) % 3
      WHEN 0 THEN
        v_salary := 'R' || (15000 + (v_n * 137) % 4000)::text;
        v_debt := 'R' || (200000 + (v_n * 911) % 50000)::text;
      WHEN 1 THEN
        v_salary := 'R' || (20000 + (v_n * 211) % 5000)::text;
        v_debt := 'R' || (50000 + (v_n * 317) % 15000)::text;
      ELSE
        v_salary := 'R' || (10000 + (v_n * 419) % 3000)::text;
        v_debt := 'R' || (100000 + (v_n * 523) % 25000)::text;
    END CASE;

    v_summary := format(
      E'[TEST-SEED-SOUKAINA]\nEmployment Status: Employed\nDebt Review Status: Not under Debt review\nCurrency: ZAR (South African Rand)\nMonthly Salary: %s\nTotal Debt: %s',
      v_salary,
      v_debt
    );

    v_phone := '+2782' || lpad((7000000 + v_n)::text, 7, '0');

    INSERT INTO public.leads (
      category_id,
      phone,
      first_name,
      last_name,
      country,
      summary,
      lead_unit_type
    )
    VALUES (
      v_category_id,
      v_phone,
      'Test',
      'Lead ' || v_n::text,
      'South Africa',
      v_summary,
      'single'
    )
    RETURNING id INTO v_lead_id;

    -- Delivery priority: free test → prepaid budget → manual insert
    IF v_has_free_test_fn AND v_has_free_test_alloc THEN
      PERFORM public.deliver_free_test_lead(v_org_id, v_lead_id);
    ELSIF v_has_prepaid_fn THEN
      PERFORM public.deliver_lead_from_prepaid_budget(v_org_id, v_lead_id);
    ELSE
      v_assignee := NULL;
      IF EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'pick_weighted_assignee'
      ) THEN
        SELECT public.pick_weighted_assignee(v_org_id) INTO v_assignee;
      END IF;

      UPDATE public.leads
      SET sold_at = now()
      WHERE id = v_lead_id;

      IF v_has_grant_source THEN
        INSERT INTO public.customer_leads (
          organization_id,
          source_lead_id,
          category_id,
          phone,
          first_name,
          last_name,
          country,
          summary,
          lead_unit_type,
          purchase_id,
          entitlement_id,
          charged_amount_cents,
          grant_source,
          assigned_to
        )
        SELECT
          v_org_id,
          l.id,
          l.category_id,
          l.phone,
          l.first_name,
          l.last_name,
          l.country,
          l.summary,
          COALESCE(l.lead_unit_type, 'single'::public.lead_unit_type),
          NULL,
          NULL,
          0,
          'free_test',
          v_assignee
        FROM public.leads l
        WHERE l.id = v_lead_id;
      ELSE
        INSERT INTO public.customer_leads (
          organization_id,
          source_lead_id,
          category_id,
          phone,
          first_name,
          last_name,
          country,
          summary,
          assigned_to
        )
        SELECT
          v_org_id,
          l.id,
          l.category_id,
          l.phone,
          l.first_name,
          l.last_name,
          l.country,
          l.summary,
          v_assignee
        FROM public.leads l
        WHERE l.id = v_lead_id;
      END IF;
    END IF;

    v_delivered := v_delivered + 1;
  END LOOP;

  -- deliver_free_test_lead omits country; backfill from inventory
  UPDATE public.customer_leads cl
  SET country = l.country
  FROM public.leads l
  WHERE cl.source_lead_id = l.id
    AND cl.summary LIKE '%[TEST-SEED-SOUKAINA]%';

  RAISE NOTICE 'Delivered % test leads to organization %', v_delivered, v_org_id;
END;
$$;

-- Verify: should return 20 rows
SELECT
  cl.id,
  cl.first_name || ' ' || cl.last_name AS lead_name,
  cl.phone,
  cl.country,
  cl.grant_source,
  cl.status,
  cl.summary,
  cl.created_at
FROM public.customer_leads cl
WHERE cl.summary LIKE '%[TEST-SEED-SOUKAINA]%'
ORDER BY cl.last_name;
