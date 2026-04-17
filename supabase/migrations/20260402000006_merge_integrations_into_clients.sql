-- ============================================
-- Merge client_integrations into clients
--
-- client_integrations only served as a webhook router (token → client_id).
-- That logic moves directly onto clients with flat columns.
-- API keys and provider-specific config go into calendar_config / crm_config JSONB.
-- ============================================

-- ── 1. Add columns to clients ──
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS calendar_type          TEXT
    CHECK (calendar_type IN ('calcom', 'calendly', 'gohighlevel')),
  ADD COLUMN IF NOT EXISTS calendar_webhook_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS calendar_config        JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS calendar_last_webhook  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS calendar_webhook_count INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crm_type               TEXT,
  ADD COLUMN IF NOT EXISTS crm_config             JSONB NOT NULL DEFAULT '{}';

-- ── 2. Migrate data from client_integrations ──
UPDATE clients c
SET
  calendar_type          = ci.integration_type,
  calendar_webhook_token = ci.webhook_token,
  calendar_config        = COALESCE(ci.provider_config, '{}'),
  calendar_last_webhook  = ci.last_webhook_at,
  calendar_webhook_count = ci.webhook_count
FROM client_integrations ci
WHERE ci.client_id = c.id
  AND ci.integration_type IN ('calcom', 'calendly', 'gohighlevel')
  AND ci.is_active = true;

-- ── 3. Drop client_integrations ──
DROP TABLE IF EXISTS client_integrations CASCADE;
