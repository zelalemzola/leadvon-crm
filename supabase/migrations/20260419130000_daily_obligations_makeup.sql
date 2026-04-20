-- Daily lead obligations + backlog: accrue ~ceil(leads_per_week/7) per UTC calendar day.
-- Delivery fairness is hybrid:
--   Phase 1 (minimum-share): each active flow gets up to 2 leads per pass when possible.
--   Phase 2 (catch-up): remaining inventory goes to highest backlog first.
-- run_due_customer_lead_flows() or run_due_customer_lead_flows(null) = all orgs (cron).
-- run_due_customer_lead_flows('org-uuid') = single org (client "run now").

ALTER TABLE public.customer_lead_flows
  ADD COLUMN IF NOT EXISTS pending_delivery_leads integer NOT NULL DEFAULT 0 CHECK (pending_delivery_leads >= 0);

ALTER TABLE public.customer_lead_flows
  ADD COLUMN IF NOT EXISTS last_obligation_date date;

COMMENT ON COLUMN public.customer_lead_flows.pending_delivery_leads IS
  'Undelivered leads owed from daily accrual; reduced as deliveries succeed.';

COMMENT ON COLUMN public.customer_lead_flows.last_obligation_date IS
  'UTC date when daily obligation was last accrued (at most once per day per flow).';

-- Previous signature had no arguments; replace with optional org filter.
DROP FUNCTION IF EXISTS public.run_due_customer_lead_flows ();

CREATE OR REPLACE FUNCTION public.run_due_customer_lead_flows (p_organization_id uuid DEFAULT NULL)
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
  v_dummy record;
  v_floor_given integer;
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
      OR f.organization_id = p_organization_id);

  -- Phase 1: minimum-share pass so active customers are less likely to get zero.
  FOR r IN
  SELECT
    f.id,
    f.organization_id,
    f.package_id,
    f.created_by
  FROM
    public.customer_lead_flows f
  WHERE
    f.is_active = TRUE
    AND f.pending_delivery_leads > 0
    AND (p_organization_id IS NULL
      OR f.organization_id = p_organization_id)
  ORDER BY
    f.created_at ASC
    LOOP
      SELECT
        lp.* INTO v_pkg
      FROM
        public.lead_packages lp
      WHERE
        lp.id = r.package_id
        AND lp.active = TRUE;
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
          l.id INTO v_lid
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
          UPDATE
            public.customer_lead_flows
          SET
            pending_delivery_leads = pending_delivery_leads - 1,
            last_run_at = now()
          WHERE
            id = r.id;
          v_delivered := v_delivered + 1;
          v_floor_given := v_floor_given + 1;
        EXCEPTION
          WHEN OTHERS THEN
            EXIT floor_loop;
        END;
      END LOOP;
    END LOOP;

  -- Phase 2: catch-up pass (backlog first). Drain while any progress is possible.
  LOOP
    v_progressed := FALSE;
    FOR r IN
    SELECT
      f.id,
      f.organization_id,
      f.package_id,
      f.created_by
    FROM
      public.customer_lead_flows f
    WHERE
      f.is_active = TRUE
      AND f.pending_delivery_leads > 0
      AND (p_organization_id IS NULL
        OR f.organization_id = p_organization_id)
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
        AND lp.active = TRUE;
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
          l.id INTO v_lid
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
          UPDATE
            public.customer_lead_flows
          SET
            pending_delivery_leads = pending_delivery_leads - 1,
            last_run_at = now()
          WHERE
            id = r.id;
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

REVOKE ALL ON FUNCTION public.run_due_customer_lead_flows (uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_due_customer_lead_flows (uuid) TO service_role;
