-- Routing fairness v2:
-- Step 1) Floor pass: up to 5 leads per active flow.
-- Step 2) Blended pass: repeat cycles of ~70/30
--         - up to 7 leads to highest backlog flow
--         - up to 3 leads distributed fairly across other active flows
-- Step 3) Catch-up: highest backlog first until no progress.

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
