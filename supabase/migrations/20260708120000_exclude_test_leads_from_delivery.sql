-- Exclude "test" leads from automatic delivery/assignment to customers.
--
-- Test leads (used to verify Base44 / funnel ingestion) are still ingested into
-- public.leads as normal, but must never be auto-delivered or auto-assigned to a
-- real customer. We filter them out at every FIFO selection point so real leads
-- queued behind a test lead still get picked. Admin manual by-id delivery
-- functions are intentionally left unguarded so staff can still deliver a
-- specific lead on purpose (e.g. seed/test scripts).

-- Helper: a lead is considered a "test" lead when the word "test" appears in the
-- first or last name (case-insensitive). Marked IMMUTABLE so it can be used in
-- index/where predicates efficiently.
CREATE OR REPLACE FUNCTION public.lead_name_is_test (
  p_first_name text,
  p_last_name text)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  AS $$
  SELECT strpos(lower(COALESCE(p_first_name, '')), 'test') > 0
    OR strpos(lower(COALESCE(p_last_name, '')), 'test') > 0;
$$;

-- ============================================================================
-- Paid automated routing: skip test leads in every FIFO selection.
-- (verbatim from 20260428222000_routing_add_blended_70_30_phase.sql with the
--  `AND NOT public.lead_name_is_test(...)` predicate added to each lead pick.)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.run_due_customer_lead_flows (
  p_organization_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_run_id uuid DEFAULT gen_random_uuid ())
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  v_delivered integer := 0;
  v_progressed boolean;
  v_cycle_progressed boolean;
  r record;
  v_top_flow record;
  v_pending integer;
  v_lid uuid;
  v_unit public.lead_unit_type;
  v_dummy record;
  v_floor_given integer;
  v_rank integer;
  v_top_delivered integer;
  v_fair_delivered integer;
  v_today_utc date := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;
  v_month_start date := date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))::date;
BEGIN
  UPDATE public.customer_lead_flows f
  SET accrual_month = v_month_start,
      accrued_this_month = 0,
      delivered_this_month = 0
  WHERE f.accrual_month IS DISTINCT FROM v_month_start;

  WITH scoped_flows AS (
    SELECT
      f.id,
      f.organization_id,
      f.category_id,
      f.leads_per_week,
      f.pending_delivery_leads,
      f.accrued_this_month,
      f.is_active,
      f.last_obligation_date,
      c.monthly_target_leads,
      c.business_days_only,
      c.is_active AS commitment_active
    FROM public.customer_lead_flows f
    LEFT JOIN public.customer_flow_commitments c ON c.flow_id = f.id
    WHERE f.is_active = TRUE
      AND (p_organization_id IS NULL OR f.organization_id = p_organization_id)
      AND (p_category_id IS NULL OR f.category_id = p_category_id)
      AND (f.last_obligation_date IS NULL OR f.last_obligation_date < v_today_utc)
  ),
  to_accrue AS (
    SELECT
      s.id,
      CASE
        WHEN COALESCE(s.commitment_active, FALSE) THEN
          CASE
            WHEN COALESCE(s.business_days_only, TRUE) AND EXTRACT(ISODOW FROM v_today_utc) IN (6, 7) THEN 0
            ELSE GREATEST(
              0,
              LEAST(
                COALESCE(s.monthly_target_leads, 0) - s.accrued_this_month,
                CEIL(COALESCE(s.monthly_target_leads, 0)::numeric / NULLIF(public.business_days_in_month(v_today_utc), 0))
              )::integer
            )
          END
        ELSE
          GREATEST(1, CEIL(s.leads_per_week::numeric / 7.0))::integer
      END AS add_qty
    FROM scoped_flows s
  )
  UPDATE public.customer_lead_flows f
  SET pending_delivery_leads = f.pending_delivery_leads + a.add_qty,
      accrued_this_month = f.accrued_this_month + a.add_qty,
      last_obligation_date = v_today_utc,
      next_run_at = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day'
  FROM to_accrue a
  WHERE f.id = a.id;

  -- Step 1: floor share (up to 5 per flow)
  FOR r IN
  SELECT
    f.id,
    f.organization_id,
    f.category_id,
    f.created_by,
    f.created_at
  FROM public.customer_lead_flows f
  WHERE f.is_active = TRUE
    AND f.pending_delivery_leads > 0
    AND (p_organization_id IS NULL OR f.organization_id = p_organization_id)
    AND (p_category_id IS NULL OR f.category_id = p_category_id)
  ORDER BY f.created_at ASC
  LOOP
    v_floor_given := 0;
    <<floor_loop>>
    LOOP
      EXIT floor_loop WHEN v_floor_given >= 5;

      SELECT pending_delivery_leads INTO v_pending
      FROM public.customer_lead_flows
      WHERE id = r.id
      FOR UPDATE;
      EXIT floor_loop WHEN v_pending <= 0;

      SELECT l.id, l.lead_unit_type
      INTO v_lid, v_unit
      FROM public.leads l
      WHERE l.category_id = r.category_id
        AND l.sold_at IS NULL
        AND NOT public.lead_name_is_test(l.first_name, l.last_name)
      ORDER BY l.created_at ASC
      LIMIT 1
      FOR UPDATE OF l SKIP LOCKED;
      EXIT floor_loop WHEN NOT FOUND;

      BEGIN
        SELECT * INTO v_dummy
        FROM public._deliver_one_inventory_lead_prepaid(
          r.organization_id,
          v_lid,
          'Automated lead flow (daily)'
        )
        LIMIT 1;

        SELECT 1 + count(*)::integer INTO v_rank
        FROM public.customer_lead_flows f
        WHERE f.is_active = TRUE
          AND f.pending_delivery_leads > 0
          AND (p_organization_id IS NULL OR f.organization_id = p_organization_id)
          AND (p_category_id IS NULL OR f.category_id = p_category_id)
          AND (f.pending_delivery_leads > v_pending
            OR (f.pending_delivery_leads = v_pending
              AND (f.created_at < r.created_at
                OR (f.created_at = r.created_at AND f.id < r.id))));

        UPDATE public.customer_lead_flows
        SET pending_delivery_leads = pending_delivery_leads - 1,
            delivered_this_month = delivered_this_month + 1,
            last_run_at = now()
        WHERE id = r.id;

        INSERT INTO public.delivery_routing_events (
          process_run_id, organization_id, flow_id, source_lead_id, customer_lead_id,
          category_id, unit_type, routing_reason, trigger_source,
          deficit_before, deficit_after, rank_at_assignment
        )
        VALUES (
          p_run_id, r.organization_id, r.id, v_lid, (v_dummy).customer_lead_id,
          r.category_id, v_unit, 'floor_min_share', 'automation',
          v_pending, GREATEST(v_pending - 1, 0), COALESCE(v_rank, 1)
        );

        v_delivered := v_delivered + 1;
        v_floor_given := v_floor_given + 1;
      EXCEPTION
        WHEN OTHERS THEN
          EXIT floor_loop;
      END;
    END LOOP;
  END LOOP;

  -- Step 2: blended cycles (~70% highest backlog / ~30% fair to others)
  LOOP
    v_cycle_progressed := FALSE;

    SELECT
      f.id,
      f.organization_id,
      f.category_id,
      f.created_at
    INTO v_top_flow
    FROM public.customer_lead_flows f
    WHERE f.is_active = TRUE
      AND f.pending_delivery_leads > 0
      AND (p_organization_id IS NULL OR f.organization_id = p_organization_id)
      AND (p_category_id IS NULL OR f.category_id = p_category_id)
    ORDER BY f.pending_delivery_leads DESC, f.created_at ASC
    LIMIT 1;

    EXIT WHEN NOT FOUND;

    -- 70% bucket: up to 7 for highest backlog
    v_top_delivered := 0;
    <<top_bucket_loop>>
    LOOP
      EXIT top_bucket_loop WHEN v_top_delivered >= 7;

      SELECT pending_delivery_leads INTO v_pending
      FROM public.customer_lead_flows
      WHERE id = v_top_flow.id
      FOR UPDATE;
      EXIT top_bucket_loop WHEN v_pending <= 0;

      SELECT l.id, l.lead_unit_type
      INTO v_lid, v_unit
      FROM public.leads l
      WHERE l.category_id = v_top_flow.category_id
        AND l.sold_at IS NULL
        AND NOT public.lead_name_is_test(l.first_name, l.last_name)
      ORDER BY l.created_at ASC
      LIMIT 1
      FOR UPDATE OF l SKIP LOCKED;
      EXIT top_bucket_loop WHEN NOT FOUND;

      BEGIN
        SELECT * INTO v_dummy
        FROM public._deliver_one_inventory_lead_prepaid(
          v_top_flow.organization_id,
          v_lid,
          'Automated lead flow (daily)'
        )
        LIMIT 1;

        SELECT 1 + count(*)::integer INTO v_rank
        FROM public.customer_lead_flows f
        WHERE f.is_active = TRUE
          AND f.pending_delivery_leads > 0
          AND (p_organization_id IS NULL OR f.organization_id = p_organization_id)
          AND (p_category_id IS NULL OR f.category_id = p_category_id)
          AND (f.pending_delivery_leads > v_pending
            OR (f.pending_delivery_leads = v_pending
              AND (f.created_at < v_top_flow.created_at
                OR (f.created_at = v_top_flow.created_at AND f.id < v_top_flow.id))));

        UPDATE public.customer_lead_flows
        SET pending_delivery_leads = pending_delivery_leads - 1,
            delivered_this_month = delivered_this_month + 1,
            last_run_at = now()
        WHERE id = v_top_flow.id;

        INSERT INTO public.delivery_routing_events (
          process_run_id, organization_id, flow_id, source_lead_id, customer_lead_id,
          category_id, unit_type, routing_reason, trigger_source,
          deficit_before, deficit_after, rank_at_assignment
        )
        VALUES (
          p_run_id, v_top_flow.organization_id, v_top_flow.id, v_lid, (v_dummy).customer_lead_id,
          v_top_flow.category_id, v_unit, 'blend_70_backlog', 'automation',
          v_pending, GREATEST(v_pending - 1, 0), COALESCE(v_rank, 1)
        );

        v_delivered := v_delivered + 1;
        v_top_delivered := v_top_delivered + 1;
        v_cycle_progressed := TRUE;
      EXCEPTION
        WHEN OTHERS THEN
          EXIT top_bucket_loop;
      END;
    END LOOP;

    -- 30% bucket: up to 3 fairly across other active flows
    v_fair_delivered := 0;
    FOR r IN
    SELECT
      f.id,
      f.organization_id,
      f.category_id,
      f.created_at
    FROM public.customer_lead_flows f
    WHERE f.is_active = TRUE
      AND f.pending_delivery_leads > 0
      AND f.id <> v_top_flow.id
      AND (p_organization_id IS NULL OR f.organization_id = p_organization_id)
      AND (p_category_id IS NULL OR f.category_id = p_category_id)
    ORDER BY f.created_at ASC
    LOOP
      EXIT WHEN v_fair_delivered >= 3;

      SELECT pending_delivery_leads INTO v_pending
      FROM public.customer_lead_flows
      WHERE id = r.id
      FOR UPDATE;
      CONTINUE WHEN v_pending <= 0;

      SELECT l.id, l.lead_unit_type
      INTO v_lid, v_unit
      FROM public.leads l
      WHERE l.category_id = r.category_id
        AND l.sold_at IS NULL
        AND NOT public.lead_name_is_test(l.first_name, l.last_name)
      ORDER BY l.created_at ASC
      LIMIT 1
      FOR UPDATE OF l SKIP LOCKED;
      CONTINUE WHEN NOT FOUND;

      BEGIN
        SELECT * INTO v_dummy
        FROM public._deliver_one_inventory_lead_prepaid(
          r.organization_id,
          v_lid,
          'Automated lead flow (daily)'
        )
        LIMIT 1;

        SELECT 1 + count(*)::integer INTO v_rank
        FROM public.customer_lead_flows f
        WHERE f.is_active = TRUE
          AND f.pending_delivery_leads > 0
          AND (p_organization_id IS NULL OR f.organization_id = p_organization_id)
          AND (p_category_id IS NULL OR f.category_id = p_category_id)
          AND (f.pending_delivery_leads > v_pending
            OR (f.pending_delivery_leads = v_pending
              AND (f.created_at < r.created_at
                OR (f.created_at = r.created_at AND f.id < r.id))));

        UPDATE public.customer_lead_flows
        SET pending_delivery_leads = pending_delivery_leads - 1,
            delivered_this_month = delivered_this_month + 1,
            last_run_at = now()
        WHERE id = r.id;

        INSERT INTO public.delivery_routing_events (
          process_run_id, organization_id, flow_id, source_lead_id, customer_lead_id,
          category_id, unit_type, routing_reason, trigger_source,
          deficit_before, deficit_after, rank_at_assignment
        )
        VALUES (
          p_run_id, r.organization_id, r.id, v_lid, (v_dummy).customer_lead_id,
          r.category_id, v_unit, 'blend_30_fair', 'automation',
          v_pending, GREATEST(v_pending - 1, 0), COALESCE(v_rank, 1)
        );

        v_delivered := v_delivered + 1;
        v_fair_delivered := v_fair_delivered + 1;
        v_cycle_progressed := TRUE;
      EXCEPTION
        WHEN OTHERS THEN
          CONTINUE;
      END;
    END LOOP;

    EXIT WHEN NOT v_cycle_progressed;
  END LOOP;

  -- Step 3: full catch-up backlog-first
  LOOP
    v_progressed := FALSE;
    FOR r IN
    SELECT
      f.id,
      f.organization_id,
      f.category_id,
      f.created_by,
      f.created_at
    FROM
      public.customer_lead_flows f
    WHERE
      f.is_active = TRUE
      AND f.pending_delivery_leads > 0
      AND (p_organization_id IS NULL OR f.organization_id = p_organization_id)
      AND (p_category_id IS NULL OR f.category_id = p_category_id)
    ORDER BY
      f.pending_delivery_leads DESC,
      f.created_at ASC
      LOOP
        <<deliver_loop>>
        LOOP
          SELECT
            pending_delivery_leads INTO v_pending
          FROM
            public.customer_lead_flows
          WHERE
            id = r.id
          FOR UPDATE;
          EXIT deliver_loop WHEN v_pending <= 0;
          SELECT
            l.id,
            l.lead_unit_type INTO v_lid,
            v_unit
          FROM
            public.leads l
          WHERE
            l.category_id = r.category_id
            AND l.sold_at IS NULL
            AND NOT public.lead_name_is_test(l.first_name, l.last_name)
          ORDER BY
            l.created_at ASC
          LIMIT 1
          FOR UPDATE OF l SKIP LOCKED;
          IF NOT FOUND THEN
            EXIT deliver_loop;
          END IF;
          BEGIN
            SELECT
              * INTO v_dummy
            FROM
              public._deliver_one_inventory_lead_prepaid (r.organization_id, v_lid, 'Automated lead flow (daily)')
            LIMIT 1;
            SELECT
              1 + count(*)::integer INTO v_rank
            FROM
              public.customer_lead_flows f
            WHERE
              f.is_active = TRUE
              AND f.pending_delivery_leads > 0
              AND (p_organization_id IS NULL OR f.organization_id = p_organization_id)
              AND (p_category_id IS NULL OR f.category_id = p_category_id)
              AND (f.pending_delivery_leads > v_pending
                OR (f.pending_delivery_leads = v_pending
                  AND (f.created_at < r.created_at
                    OR (f.created_at = r.created_at AND f.id < r.id))));
            UPDATE
              public.customer_lead_flows
            SET
              pending_delivery_leads = pending_delivery_leads - 1,
              delivered_this_month = delivered_this_month + 1,
              last_run_at = now()
            WHERE
              id = r.id;
            INSERT INTO public.delivery_routing_events (process_run_id, organization_id, flow_id, source_lead_id, customer_lead_id, category_id, unit_type, routing_reason, trigger_source, deficit_before, deficit_after, rank_at_assignment)
              VALUES (p_run_id, r.organization_id, r.id, v_lid, (v_dummy).customer_lead_id, r.category_id, v_unit, 'deficit_catchup', 'automation', v_pending, GREATEST(v_pending - 1, 0), COALESCE(v_rank, 1));
            v_delivered := v_delivered + 1;
            v_progressed := TRUE;
          EXCEPTION
            WHEN OTHERS THEN
              EXIT deliver_loop;
          END;
        END LOOP;
      END LOOP;
    EXIT WHEN NOT v_progressed;
  END LOOP;

  RETURN v_delivered;
END;
$$;

REVOKE ALL ON FUNCTION public.run_due_customer_lead_flows (uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_due_customer_lead_flows (uuid, uuid, uuid) TO service_role;

-- ============================================================================
-- Free-delivery distribution: skip test leads in both selection sites.
-- (verbatim from 20260706210000_lead_review_status_and_free_delivery_filters.sql
--  with the test-name predicate added.)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.distribute_free_delivery_leads (
  p_category_id uuid DEFAULT NULL)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  v_delivered integer := 0;
  v_lead_id uuid;
  v_org_id uuid;
  v_remaining_total integer;
  v_eligible_from timestamptz;
  v_allowed_category_ids uuid[];
  v_allowed_source_systems text[];
  v_allowed_review_statuses text[];
BEGIN
  IF EXISTS (
    SELECT
      1
    FROM
      public.organization_free_delivery d
    WHERE
      d.is_active = TRUE
      AND d.quota_total > 0
      AND d.quota_delivered < d.quota_total
      AND d.distribute_after > now()) THEN
    RETURN 0;
  END IF;

  LOOP
    SELECT
      COALESCE(SUM(GREATEST(d.quota_total - d.quota_delivered, 0)), 0) INTO v_remaining_total
    FROM
      public.organization_free_delivery d
    WHERE
      d.is_active = TRUE
      AND d.quota_total > 0
      AND d.quota_delivered < d.quota_total
      AND d.distribute_after <= now();

    EXIT WHEN v_remaining_total <= 0;

    SELECT
      d.organization_id,
      d.eligible_from,
      d.allowed_category_ids,
      d.allowed_source_systems,
      d.allowed_review_statuses INTO v_org_id,
      v_eligible_from,
      v_allowed_category_ids,
      v_allowed_source_systems,
      v_allowed_review_statuses
    FROM
      public.organization_free_delivery d
    WHERE
      d.is_active = TRUE
      AND d.quota_total > 0
      AND d.quota_delivered < d.quota_total
      AND d.distribute_after <= now()
      AND EXISTS (
        SELECT
          1
        FROM
          public.leads l
        WHERE
          l.sold_at IS NULL
          AND NOT public.lead_name_is_test(l.first_name, l.last_name)
          AND (p_category_id IS NULL
            OR l.category_id = p_category_id)
          AND l.created_at >= d.eligible_from
          AND public.lead_matches_org_free_delivery_filters (
            l.category_id,
            l.source_system,
            l.review_status,
            d.allowed_category_ids,
            d.allowed_source_systems,
            d.allowed_review_statuses))
    ORDER BY
      (d.quota_delivered::numeric / d.quota_total::numeric) ASC,
      d.activated_at ASC NULLS LAST,
      d.organization_id ASC
    LIMIT 1;

    IF v_org_id IS NULL THEN
      EXIT;
    END IF;

    SELECT
      l.id INTO v_lead_id
    FROM
      public.leads l
    WHERE
      l.sold_at IS NULL
      AND NOT public.lead_name_is_test(l.first_name, l.last_name)
      AND (p_category_id IS NULL
        OR l.category_id = p_category_id)
      AND l.created_at >= v_eligible_from
      AND public.lead_matches_org_free_delivery_filters (
        l.category_id,
        l.source_system,
        l.review_status,
        v_allowed_category_ids,
        v_allowed_source_systems,
        v_allowed_review_statuses)
    ORDER BY
      l.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    EXIT WHEN v_lead_id IS NULL;

    PERFORM
      public.deliver_free_delivery_lead (v_org_id, v_lead_id);
    v_delivered := v_delivered + 1;
  END LOOP;

  RETURN v_delivered;
END;
$$;

-- ============================================================================
-- Wallet-based package purchase (client): skip test leads in both the
-- availability check and the actual allocation.
-- (verbatim from 20260418150000_lead_country.sql with the test-name predicate.)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.customer_purchase_package (p_package_id uuid, p_quantity integer DEFAULT 1)
  RETURNS TABLE (
    purchase_id uuid,
    total_amount_cents bigint,
    leads_allocated integer)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  v_org_id uuid;
  v_actor_id uuid;
  v_package record;
  v_offer_id uuid;
  v_discount numeric(5,2) := 0;
  v_unit_price integer;
  v_leads_needed integer;
  v_total bigint;
  v_wallet record;
  v_purchase_id uuid;
  v_allocated integer;
BEGIN
  v_actor_id := auth.uid();
  v_org_id := public.user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization context';
  END IF;

  IF p_quantity < 1 THEN
    RAISE EXCEPTION 'Quantity must be >= 1';
  END IF;

  SELECT lp.*
  INTO v_package
  FROM public.lead_packages lp
  WHERE lp.id = p_package_id
    AND lp.active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package not available';
  END IF;

  v_unit_price := v_package.price_cents;
  v_leads_needed := v_package.leads_count * p_quantity;

  SELECT lo.id, lo.discount_percent
  INTO v_offer_id, v_discount
  FROM public.lead_offers lo
  WHERE lo.package_id = p_package_id
    AND lo.active = true
    AND (lo.starts_at IS NULL OR lo.starts_at <= now())
    AND (lo.ends_at IS NULL OR lo.ends_at >= now())
  ORDER BY lo.discount_percent DESC, lo.created_at ASC
  LIMIT 1;

  v_total := ROUND((v_unit_price::numeric * p_quantity::numeric) * ((100 - COALESCE(v_discount, 0)) / 100.0));

  SELECT w.*
  INTO v_wallet
  FROM public.wallets w
  WHERE w.organization_id = v_org_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;
  IF v_wallet.balance_cents < v_total THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  WITH selected AS (
    SELECT l.*
    FROM public.leads l
    WHERE l.category_id = v_package.category_id
      AND l.sold_at IS NULL
      AND NOT public.lead_name_is_test(l.first_name, l.last_name)
    ORDER BY l.created_at ASC
    LIMIT v_leads_needed
    FOR UPDATE SKIP LOCKED
  )
  SELECT count(*)::integer INTO v_allocated FROM selected;

  IF v_allocated < v_leads_needed THEN
    RAISE EXCEPTION 'Not enough leads available for this package';
  END IF;

  UPDATE public.wallets
  SET balance_cents = balance_cents - v_total
  WHERE id = v_wallet.id;

  INSERT INTO public.lead_purchases (
    organization_id,
    package_id,
    offer_id,
    quantity,
    leads_allocated,
    unit_price_cents,
    discount_percent,
    total_amount_cents,
    currency,
    purchased_by
  )
  VALUES (
    v_org_id,
    p_package_id,
    v_offer_id,
    p_quantity,
    v_allocated,
    v_unit_price,
    COALESCE(v_discount, 0),
    v_total,
    'USD',
    v_actor_id
  )
  RETURNING id INTO v_purchase_id;

  INSERT INTO public.wallet_transactions (
    organization_id,
    wallet_id,
    tx_type,
    amount_cents,
    reference_type,
    reference_id,
    description
  )
  VALUES (
    v_org_id,
    v_wallet.id,
    'debit',
    v_total,
    'lead_purchase',
    v_purchase_id::text,
    'Lead package purchase'
  );

  WITH selected AS (
    SELECT l.*
    FROM public.leads l
    WHERE l.category_id = v_package.category_id
      AND l.sold_at IS NULL
      AND NOT public.lead_name_is_test(l.first_name, l.last_name)
    ORDER BY l.created_at ASC
    LIMIT v_leads_needed
    FOR UPDATE SKIP LOCKED
  ), updated AS (
    UPDATE public.leads l
    SET sold_at = now()
    FROM selected s
    WHERE l.id = s.id
    RETURNING l.*
  )
  INSERT INTO public.customer_leads (
    organization_id,
    source_lead_id,
    category_id,
    purchase_id,
    phone,
    first_name,
    last_name,
    notes,
    country
  )
  SELECT
    v_org_id,
    u.id,
    u.category_id,
    v_purchase_id,
    u.phone,
    u.first_name,
    u.last_name,
    u.notes,
    u.country
  FROM updated u;

  purchase_id := v_purchase_id;
  total_amount_cents := v_total;
  leads_allocated := v_allocated;
  RETURN NEXT;
END;
$$;

-- ============================================================================
-- Org-scoped package purchase (cron / service role): skip test leads.
-- (verbatim from 20260419100000_prepaid_split_charge_and_flows.sql with the
--  test-name predicate.)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.customer_purchase_package_for_org (
  p_org_id uuid,
  p_package_id uuid,
  p_quantity integer,
  p_actor_id uuid)
  RETURNS TABLE (
    purchase_id uuid,
    total_amount_cents bigint,
    leads_allocated integer)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  v_org_id uuid := p_org_id;
  v_package record;
  v_leads_needed integer;
  v_rec record;
  v_line_amt bigint;
  v_total bigint := 0;
  v_n integer := 0;
BEGIN
  IF p_quantity < 1 THEN
    RAISE EXCEPTION 'Quantity must be >= 1';
  END IF;

  SELECT
    lp.* INTO v_package
  FROM
    public.lead_packages lp
  WHERE
    lp.id = p_package_id
    AND lp.active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package not available';
  END IF;

  v_leads_needed := v_package.leads_count * p_quantity;

  FOR v_rec IN
  SELECT
    l.*
  FROM
    public.leads l
  WHERE
    l.category_id = v_package.category_id
    AND l.sold_at IS NULL
    AND NOT public.lead_name_is_test(l.first_name, l.last_name)
  ORDER BY
    l.created_at ASC
  LIMIT v_leads_needed
  FOR UPDATE OF l SKIP LOCKED
    LOOP
      SELECT
        t.amount_cents INTO v_line_amt
      FROM
        public._deliver_one_inventory_lead_prepaid (v_org_id, v_rec.id, 'Lead flow (prepaid delivery)') AS t;
      v_total := v_total + v_line_amt;
      v_n := v_n + 1;
    END LOOP;

  IF v_n < v_leads_needed THEN
    RAISE EXCEPTION 'Not enough leads available for this package';
  END IF;

  purchase_id := NULL;
  total_amount_cents := v_total;
  leads_allocated := v_n;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.customer_purchase_package_for_org (uuid, uuid, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_purchase_package_for_org (uuid, uuid, integer, uuid) TO service_role;
