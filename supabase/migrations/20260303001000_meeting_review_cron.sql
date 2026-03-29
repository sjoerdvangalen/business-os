-- Meeting review cron: sends Slack Block Kit review messages 30 min after meetings
-- Runs every 5 minutes to check for pending reviews

SELECT cron.schedule(
  'meeting-review',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/meeting-review',
    headers := ('{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key', true) || '"}')::jsonb,
    body := '{}'::jsonb
  );
  $$
);
