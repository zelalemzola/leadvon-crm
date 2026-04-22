-- Routing observability + idempotent processing jobs.
-- Adds:
-- 1) delivery_routing_events (why a lead was routed)
-- 2) routing_job_runs (idempotency guard for processing triggers)
-- 3) run_due_customer_lead_flows upgraded with category scope + routing event writes

CREATE TABLE IF NOT EXISTS public.delivery_routing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  process_run_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  flow_id uuid REFERENCES public.customer_lead_flows (id) ON DELETE SET NULL,
  source_lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE RESTRICT,
  customer_lead_id uuid NOT NULL REFERENCES public.customer_leads (id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories (id) ON DELETE RESTRICT,
  unit_type public.lead_unit_type NOT NULL,
  routing_reason text NOT NULL,
  trigger_source text NOT NULL DEFAULT 'automation',
  deficit_before integer NOT NULL CHECK (deficit_before >= 0),
  deficit_after integer NOT NULL CHECK (deficit_after >= 0),
  rank_at_assignment integer NOT NULL CHECK (rank_at_assignment >= 1),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_routing_events_org_created
  ON public.delivery_routing_events (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_routing_events_flow_created
  ON public.delivery_routing_events (flow_id, created_at DESC);

ALTER TABLE public.delivery_routing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY delivery_routing_events_org_select ON public.delivery_routing_events
  FOR SELECT TO authenticated
  USING (organization_id = public.user_org_id () OR public.is_staff ());

CREATE POLICY delivery_routing_events_staff_write ON public.delivery_routing_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff ());

CREATE TABLE IF NOT EXISTS public.routing_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  idempotency_key text NOT NULL UNIQUE,
  category_id uuid REFERENCES public.categories (id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  trigger_source text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  delivered_count integer NOT NULL DEFAULT 0 CHECK (delivered_count >= 0),
  error_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_routing_job_runs_created
  ON public.routing_job_runs (created_at DESC);

ALTER TABLE public.routing_job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY routing_job_runs_staff_select ON public.routing_job_runs
  FOR SELECT TO authenticated
  USING (public.is_staff ());

CREATE POLICY routing_job_runs_staff_write ON public.routing_job_runs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff ());

CREATE POLICY routing_job_runs_staff_update ON public.routing_job_runs
  FOR UPDATE TO authenticated
  USING (public.is_staff ())
  WITH CHECK (public.is_staff ());

-- Replace with optional org/category scope and per-assignment routing event logging.
DROP FUNCTION IF EXISTS public.run_due_customer_lead_flows ();
DROP FUNCTION IF EXISTS public.run_due_customer_lead_flows (uuid);

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
BEGIN
  UPDATE
    public.customer_lead_flows f
  SET
    pending_delivery_leads = f.pending_delivery_leads + GREATEST (1, CEIL(f.leads_per_week::numeric / 7.0)),
    last_obligation_date = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date,
    next_run_at = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day'
  WHERE
    f.is_active = TRUE
    AND (f.last_obligation_date IS NULL
      OR f.last_obligation_date < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)
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
          OR lp.category_id = p_category_id));

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
