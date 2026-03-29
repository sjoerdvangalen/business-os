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
    headers := ('{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key', true) || '"}')::jsonb,
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
    headers := ('{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key', true) || '"}')::jsonb,
    body := '{}'::jsonb
  );
  $$
);
