-- Supabase-managed scheduling for HTTP cron endpoints (replaces Vercel cron dependency).
-- This migration:
-- 1) enables pg_cron + pg_net
-- 2) provides helper functions to configure/remove jobs safely
--
-- Usage after deploy (run in SQL editor once per environment):
--   SELECT public.configure_http_cron_jobs(
--     'https://leadvon-crm.vercel.app',
--     'your-cron-secret'
--   );
--
-- To remove:
--   SELECT public.remove_http_cron_jobs();

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.remove_http_cron_jobs ()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'leadvon-base44-sync-5m',
      'leadvon-lead-flows-5m',
      'leadvon-invoices-daily'
    )
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.configure_http_cron_jobs (
  p_base_url text,
  p_cron_secret text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_base_url text := rtrim(COALESCE(p_base_url, ''), '/');
  v_secret text := COALESCE(p_cron_secret, '');
BEGIN
  IF v_base_url = '' THEN
    RAISE EXCEPTION 'base URL is required';
  END IF;
  IF v_secret = '' THEN
    RAISE EXCEPTION 'cron secret is required';
  END IF;

  PERFORM public.remove_http_cron_jobs();

  -- Base44 ingest every 5 minutes.
  PERFORM cron.schedule(
    'leadvon-base44-sync-5m',
    '*/5 * * * *',
    format(
      $cmd$
      SELECT net.http_post(
        url := %L,
        headers := %L::jsonb
      );
      $cmd$,
      v_base_url || '/api/cron/base44-sync',
      jsonb_build_object('x-cron-secret', v_secret)::text
    )
  );

  -- Flow runner every 5 minutes.
  PERFORM cron.schedule(
    'leadvon-lead-flows-5m',
    '*/5 * * * *',
    format(
      $cmd$
      SELECT net.http_post(
        url := %L,
        headers := %L::jsonb
      );
      $cmd$,
      v_base_url || '/api/cron/lead-flows',
      jsonb_build_object('x-cron-secret', v_secret)::text
    )
  );

  -- Invoice job daily at 00:05 UTC.
  PERFORM cron.schedule(
    'leadvon-invoices-daily',
    '5 0 * * *',
    format(
      $cmd$
      SELECT net.http_post(
        url := %L,
        headers := %L::jsonb
      );
      $cmd$,
      v_base_url || '/api/cron/invoices',
      jsonb_build_object('x-cron-secret', v_secret)::text
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.configure_http_cron_jobs (text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_http_cron_jobs () FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.configure_http_cron_jobs (text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_http_cron_jobs () TO service_role;
