-- Fix cron jobs: use service role key for auth (functions are no-verify-jwt)

SELECT cron.unschedule('sync-plusvibe-campaigns');
SELECT cron.unschedule('sync-plusvibe-accounts');
SELECT cron.unschedule('sync-plusvibe-warmup');

-- Campaigns: every 15 minutes
SELECT cron.schedule(
  'sync-plusvibe-campaigns',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/sync-plusvibe-campaigns',
    headers := ('{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key', true) || '"}')::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Email accounts: every 15 minutes
SELECT cron.schedule(
  'sync-plusvibe-accounts',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/sync-plusvibe-accounts',
    headers := ('{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key', true) || '"}')::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Warmup snapshots: daily at midnight UTC
SELECT cron.schedule(
  'sync-plusvibe-warmup',
  '0 0 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/sync-plusvibe-warmup',
    headers := ('{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key', true) || '"}')::jsonb,
    body := '{}'::jsonb
  );
  $$
);
