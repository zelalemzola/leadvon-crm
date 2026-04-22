-- Monthly commitments + business-day pacing.
-- Keeps current flow APIs intact while upgrading accrual semantics.

CREATE TABLE IF NOT EXISTS public.customer_flow_commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  flow_id uuid NOT NULL UNIQUE REFERENCES public.customer_lead_flows (id) ON DELETE CASCADE,
  monthly_target_leads integer NOT NULL CHECK (monthly_target_leads > 0),
  business_days_only boolean NOT NULL DEFAULT TRUE,
  shortfall_policy text NOT NULL DEFAULT 'rollover' CHECK (shortfall_policy IN ('rollover', 'credit_note')),
  is_active boolean NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER customer_flow_commitments_updated_at
  BEFORE UPDATE ON public.customer_flow_commitments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

ALTER TABLE public.customer_flow_commitments ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_flow_commitments_select ON public.customer_flow_commitments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.customer_lead_flows f
      WHERE f.id = flow_id
        AND (f.organization_id = public.user_org_id() OR public.is_staff())
    )
  );

CREATE POLICY customer_flow_commitments_write_staff ON public.customer_flow_commitments
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

ALTER TABLE public.customer_lead_flows
  ADD COLUMN IF NOT EXISTS accrual_month date;

ALTER TABLE public.customer_lead_flows
  ADD COLUMN IF NOT EXISTS accrued_this_month integer NOT NULL DEFAULT 0 CHECK (accrued_this_month >= 0);

ALTER TABLE public.customer_lead_flows
  ADD COLUMN IF NOT EXISTS delivered_this_month integer NOT NULL DEFAULT 0 CHECK (delivered_this_month >= 0);

CREATE OR REPLACE FUNCTION public.business_days_in_month (p_day date)
  RETURNS integer
  LANGUAGE sql
  STABLE
  AS $$
  SELECT
    count(*)::integer
  FROM
    generate_series(
      date_trunc('month', p_day)::date,
      (date_trunc('month', p_day)::date + INTERVAL '1 month - 1 day')::date,
      INTERVAL '1 day'
    ) d
  WHERE
    EXTRACT(ISODOW FROM d) < 6;
$$;

GRANT EXECUTE ON FUNCTION public.business_days_in_month (date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.business_days_in_month (date) TO service_role;

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
  r record;
  v_pkg record;
  v_pending integer;
  v_lid uuid;
  v_unit public.lead_unit_type;
  v_dummy record;
  v_floor_given integer;
  v_rank integer;
  v_today_utc date := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;
  v_month_start date := date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))::date;
BEGIN
  -- Month rollover counters for pacing.
  UPDATE public.customer_lead_flows f
  SET accrual_month = v_month_start,
      accrued_this_month = 0,
      delivered_this_month = 0
  WHERE f.accrual_month IS DISTINCT FROM v_month_start;

  -- Daily accrual:
  -- 1) If commitment exists + active: use monthly_target_leads / business_days_in_month.
  -- 2) Else fallback to prior behavior from leads_per_week (approx monthly pace).
  WITH scoped_flows AS (
    SELECT
      f.id,
      f.organization_id,
      f.package_id,
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
    JOIN public.lead_packages lp ON lp.id = f.package_id AND lp.active = TRUE
    WHERE f.is_active = TRUE
      AND (p_organization_id IS NULL OR f.organization_id = p_organization_id)
      AND (p_category_id IS NULL OR lp.category_id = p_category_id)
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

  -- Phase 1: minimum-share (up to 2 leads per active flow)
  FOR r IN
  SELECT
    f.id,
    f.organization_id,
    f.package_id,
    f.created_by,
    f.created_at
  FROM
    public.customer_lead_flows f
  WHERE
    f.is_active = TRUE
    AND f.pending_delivery_leads > 0
    AND (p_organization_id IS NULL
      OR f.organization_id = p_organization_id)
    AND EXISTS (
      SELECT
        1
      FROM
        public.lead_packages lp
      WHERE
        lp.id = f.package_id
        AND lp.active = TRUE
        AND (p_category_id IS NULL
          OR lp.category_id = p_category_id))
  ORDER BY
    f.created_at ASC
    LOOP
      SELECT
        lp.* INTO v_pkg
      FROM
        public.lead_packages lp
      WHERE
        lp.id = r.package_id
        AND lp.active = TRUE
        AND (p_category_id IS NULL
          OR lp.category_id = p_category_id);
      IF NOT FOUND THEN
        CONTINUE;
      END IF;
      v_floor_given := 0;
      <<floor_loop>>
      LOOP
        EXIT floor_loop WHEN v_floor_given >= 2;
        SELECT
          pending_delivery_leads INTO v_pending
        FROM
          public.customer_lead_flows
        WHERE
          id = r.id
        FOR UPDATE;
        EXIT floor_loop WHEN v_pending <= 0;
        SELECT
          l.id,
          l.lead_unit_type INTO v_lid,
          v_unit
        FROM
          public.leads l
        WHERE
          l.category_id = v_pkg.category_id
          AND l.sold_at IS NULL
        ORDER BY
          l.created_at ASC
        LIMIT 1
        FOR UPDATE OF l SKIP LOCKED;
        EXIT floor_loop WHEN NOT FOUND;
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
            JOIN public.lead_packages lp ON lp.id = f.package_id
              AND lp.active = TRUE
          WHERE
            f.is_active = TRUE
            AND f.pending_delivery_leads > 0
            AND (p_organization_id IS NULL
              OR f.organization_id = p_organization_id)
            AND (p_category_id IS NULL
              OR lp.category_id = p_category_id)
            AND (f.pending_delivery_leads > v_pending
              OR (f.pending_delivery_leads = v_pending
                AND (f.created_at < r.created_at
                  OR (f.created_at = r.created_at
                    AND f.id < r.id))));
          UPDATE
            public.customer_lead_flows
          SET
            pending_delivery_leads = pending_delivery_leads - 1,
            delivered_this_month = delivered_this_month + 1,
            last_run_at = now()
          WHERE
            id = r.id;
          INSERT INTO public.delivery_routing_events (process_run_id, organization_id, flow_id, source_lead_id, customer_lead_id, category_id, unit_type, routing_reason, trigger_source, deficit_before, deficit_after, rank_at_assignment)
            VALUES (p_run_id, r.organization_id, r.id, v_lid, (v_dummy).customer_lead_id, v_pkg.category_id, v_unit, 'floor_min_share', 'automation', v_pending, GREATEST(v_pending - 1, 0), COALESCE(v_rank, 1));
          v_delivered := v_delivered + 1;
          v_floor_given := v_floor_given + 1;
        EXCEPTION
          WHEN OTHERS THEN
            EXIT floor_loop;
        END;
      END LOOP;
    END LOOP;

  -- Phase 2: catch-up
  LOOP
    v_progressed := FALSE;
    FOR r IN
    SELECT
      f.id,
      f.organization_id,
      f.package_id,
      f.created_by,
      f.created_at
    FROM
      public.customer_lead_flows f
    WHERE
      f.is_active = TRUE
      AND f.pending_delivery_leads > 0
      AND (p_organization_id IS NULL
        OR f.organization_id = p_organization_id)
      AND EXISTS (
        SELECT
          1
        FROM
          public.lead_packages lp
        WHERE
          lp.id = f.package_id
          AND lp.active = TRUE
          AND (p_category_id IS NULL
            OR lp.category_id = p_category_id))
    ORDER BY
      f.pending_delivery_leads DESC,
      f.created_at ASC
      LOOP
        SELECT
          lp.* INTO v_pkg
        FROM
          public.lead_packages lp
        WHERE
          lp.id = r.package_id
          AND lp.active = TRUE
          AND (p_category_id IS NULL
            OR lp.category_id = p_category_id);
        IF NOT FOUND THEN
          CONTINUE;
        END IF;
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
            l.category_id = v_pkg.category_id
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
              JOIN public.lead_packages lp ON lp.id = f.package_id
                AND lp.active = TRUE
            WHERE
              f.is_active = TRUE
              AND f.pending_delivery_leads > 0
              AND (p_organization_id IS NULL
                OR f.organization_id = p_organization_id)
              AND (p_category_id IS NULL
                OR lp.category_id = p_category_id)
              AND (f.pending_delivery_leads > v_pending
                OR (f.pending_delivery_leads = v_pending
                  AND (f.created_at < r.created_at
                    OR (f.created_at = r.created_at
                      AND f.id < r.id))));
            UPDATE
              public.customer_lead_flows
            SET
              pending_delivery_leads = pending_delivery_leads - 1,
              delivered_this_month = delivered_this_month + 1,
              last_run_at = now()
            WHERE
              id = r.id;
            INSERT INTO public.delivery_routing_events (process_run_id, organization_id, flow_id, source_lead_id, customer_lead_id, category_id, unit_type, routing_reason, trigger_source, deficit_before, deficit_after, rank_at_assignment)
              VALUES (p_run_id, r.organization_id, r.id, v_lid, (v_dummy).customer_lead_id, v_pkg.category_id, v_unit, 'deficit_catchup', 'automation', v_pending, GREATEST(v_pending - 1, 0), COALESCE(v_rank, 1));
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

