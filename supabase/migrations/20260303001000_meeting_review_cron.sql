-- Meeting review cron: sends Slack Block Kit review messages 30 min after meetings
-- Runs every 5 minutes to check for pending reviews

SELECT cron.schedule(
  'meeting-review',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/meeting-review',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqaGJieW9kcmJ1YWJmemFmenJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcyODQ4MiwiZXhwIjoyMDgzMzA0NDgyfQ.Ng8Wvy-tvCZpXqqsTvESvuwITznkQukJ_sL6Roe7ZVI"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
