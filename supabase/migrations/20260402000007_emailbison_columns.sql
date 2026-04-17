-- ============================================
-- EMAILBISON INTEGRATION — Provider columns + IDs
-- ============================================

-- Provider kolom toevoegen aan campaigns
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'plusvibe',
  ADD COLUMN IF NOT EXISTS emailbison_id TEXT UNIQUE;

-- Provider kolom toevoegen aan email_inboxes
ALTER TABLE email_inboxes
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'plusvibe',
  ADD COLUMN IF NOT EXISTS emailbison_id TEXT UNIQUE;

-- Provider kolom toevoegen aan email_threads (voor webhook onderscheid)
ALTER TABLE email_threads
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'plusvibe',
  ADD COLUMN IF NOT EXISTS provider_lead_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_campaign_id TEXT;

-- Index voor snelle lookups
CREATE INDEX IF NOT EXISTS idx_campaigns_provider ON campaigns(provider);
CREATE INDEX IF NOT EXISTS idx_email_inboxes_provider ON email_inboxes(provider);
CREATE INDEX IF NOT EXISTS idx_campaigns_emailbison_id ON campaigns(emailbison_id);
CREATE INDEX IF NOT EXISTS idx_email_inboxes_emailbison_id ON email_inboxes(emailbison_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_provider ON email_threads(provider);
CREATE INDEX IF NOT EXISTS idx_email_threads_provider_lead ON email_threads(provider, provider_lead_id);

-- ============================================
-- PG_CRON JOBS — EmailBison syncs
-- ============================================

-- EmailBison campaigns sync elke 15 minuten
SELECT cron.schedule(
  'sync-emailbison-campaigns',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/sync-emailbison-campaigns',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);

-- EmailBison accounts sync elke 15 minuten
SELECT cron.schedule(
  'sync-emailbison-accounts',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/sync-emailbison-accounts',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);

-- EmailBison sequences sync elk uur (meer API calls = minder frequent)
SELECT cron.schedule(
  'sync-emailbison-sequences',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/sync-emailbison-sequences',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
