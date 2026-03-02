-- Drop kpis and okrs — data already in campaigns/contacts
DROP TABLE IF EXISTS kpis CASCADE;
DROP TABLE IF EXISTS okrs CASCADE;

-- Remove cron job for aggregate-kpis if exists
SELECT cron.unschedule('aggregate-kpis-daily') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'aggregate-kpis-daily'
);
