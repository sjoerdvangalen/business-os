-- ============================================
-- Fix cron schedules: sequences → 15min, remove dead jobs
-- ============================================

-- Remove aggregate-kpis cron (kpis table is dropped)
SELECT cron.unschedule('aggregate-kpis');

-- Remove old daily sync-sequences job
SELECT cron.unschedule('sync-sequences-daily');

-- sync-sequences: every 15 minutes (was daily)
SELECT cron.schedule(
  'sync-sequences',
  '*/15 * * * *',
  $$SELECT net.http_post(
    url := 'https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/sync-sequences',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  )$$
);
