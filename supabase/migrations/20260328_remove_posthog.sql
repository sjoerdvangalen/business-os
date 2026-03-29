-- Cleanup: remove PostHog remnants from the database
-- Drops the events table and unschedules any PostHog-related cron jobs

DROP TABLE IF EXISTS posthog_events;

DO $$
DECLARE
  job_record RECORD;
BEGIN
  FOR job_record IN
    SELECT jobid, jobname FROM cron.job WHERE jobname ILIKE '%posthog%'
  LOOP
    PERFORM cron.unschedule(job_record.jobid);
    RAISE NOTICE 'Unscheduled PostHog cron job: %', job_record.jobname;
  END LOOP;
END;
$$;
