-- Add Funnel ingestion HTTP cron alongside existing jobs.

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
      'leadvon-funnel-sync-5m',
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

  PERFORM cron.schedule(
    'leadvon-funnel-sync-5m',
    '*/5 * * * *',
    format(
      $cmd$
      SELECT net.http_post(
        url := %L,
        headers := %L::jsonb
      );
      $cmd$,
      v_base_url || '/api/cron/funnel-sync',
      jsonb_build_object('x-cron-secret', v_secret)::text
    )
  );

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
