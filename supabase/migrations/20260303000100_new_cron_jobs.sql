-- ============================================
-- Cron jobs for new sync functions
-- ============================================

-- sync-domains: daily at 05:30 UTC
SELECT cron.schedule(
  'sync-domains-daily',
  '30 5 * * *',
  $$SELECT net.http_post(
    url := 'https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/sync-domains',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  )$$
);

-- sync-sequences: daily at 05:45 UTC
SELECT cron.schedule(
  'sync-sequences-daily',
  '45 5 * * *',
  $$SELECT net.http_post(
    url := 'https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/sync-sequences',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  )$$
);
