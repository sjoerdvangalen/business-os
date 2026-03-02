-- Outbound OS — pg_cron jobs for new Edge Functions
-- Extends existing cron schedule with monitoring and aggregation jobs

-- Lead sync: every 15 minutes (catch-up for webhooks)
SELECT cron.schedule(
  'sync-plusvibe-leads',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/sync-plusvibe-leads',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqaGJieW9kcmJ1YWJmemFmenJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcyODQ4MiwiZXhwIjoyMDgzMzA0NDgyfQ.Ng8Wvy-tvCZpXqqsTvESvuwITznkQukJ_sL6Roe7ZVI"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- KPI aggregation: daily at 05:00 UTC
SELECT cron.schedule(
  'aggregate-kpis',
  '0 5 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/aggregate-kpis',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqaGJieW9kcmJ1YWJmemFmenJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcyODQ4MiwiZXhwIjoyMDgzMzA0NDgyfQ.Ng8Wvy-tvCZpXqqsTvESvuwITznkQukJ_sL6Roe7ZVI"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Campaign monitor: every 15 minutes
SELECT cron.schedule(
  'campaign-monitor',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/campaign-monitor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqaGJieW9kcmJ1YWJmemFmenJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcyODQ4MiwiZXhwIjoyMDgzMzA0NDgyfQ.Ng8Wvy-tvCZpXqqsTvESvuwITznkQukJ_sL6Roe7ZVI"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Domain monitor: daily at 06:00 UTC
SELECT cron.schedule(
  'domain-monitor',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/domain-monitor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqaGJieW9kcmJ1YWJmemFmenJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcyODQ4MiwiZXhwIjoyMDgzMzA0NDgyfQ.Ng8Wvy-tvCZpXqqsTvESvuwITznkQukJ_sL6Roe7ZVI"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
