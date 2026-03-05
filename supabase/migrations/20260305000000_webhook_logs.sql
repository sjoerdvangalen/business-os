-- Webhook logging table for debugging PlusVibe integration
-- Logs ALL incoming webhooks, including failed/partial requests

-- Create table if not exists (idempotent)
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'plusvibe',
  event_type TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if table already exists
ALTER TABLE webhook_logs 
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS http_status INTEGER,
  ADD COLUMN IF NOT EXISTS request_id TEXT,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_webhook_logs_source ON webhook_logs(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status ON webhook_logs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event ON webhook_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created ON webhook_logs(created_at DESC);

-- View for recent webhook activity
CREATE OR REPLACE VIEW v_webhook_activity AS
SELECT 
  id,
  source,
  event_type,
  status,
  error_message,
  http_status,
  created_at,
  CASE 
    WHEN payload ? 'email' THEN payload->>'email'
    WHEN payload ? 'lead_email' THEN payload->>'lead_email'
    ELSE NULL
  END as lead_email,
  CASE 
    WHEN payload ? 'campaign_name' THEN payload->>'campaign_name'
    ELSE NULL
  END as campaign_name
FROM webhook_logs
ORDER BY created_at DESC
LIMIT 100;
