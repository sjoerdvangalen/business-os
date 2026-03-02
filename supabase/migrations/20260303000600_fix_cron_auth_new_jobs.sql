-- Fix auth for new cron jobs: use hardcoded service_role JWT (same as working jobs)

SELECT cron.unschedule('sync-sequences');
SELECT cron.unschedule('sync-domains-daily');

-- sync-sequences: every 15 minutes
SELECT cron.schedule(
  'sync-sequences',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/sync-sequences',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqaGJieW9kcmJ1YWJmemFmenJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcyODQ4MiwiZXhwIjoyMDgzMzA0NDgyfQ.Ng8Wvy-tvCZpXqqsTvESvuwITznkQukJ_sL6Roe7ZVI"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- sync-domains: daily at 05:30 UTC
SELECT cron.schedule(
  'sync-domains',
  '30 5 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/sync-domains',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqaGJieW9kcmJ1YWJmemFmenJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcyODQ4MiwiZXhwIjoyMDgzMzA0NDgyfQ.Ng8Wvy-tvCZpXqqsTvESvuwITznkQukJ_sL6Roe7ZVI"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
