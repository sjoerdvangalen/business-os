-- Drop stale columns from clients table
-- These were superseded by the v3 model (status/stage/approval_status enums + workflow_metrics JSONB)
-- All code references to these columns have been removed before this migration.

ALTER TABLE clients
  DROP COLUMN IF EXISTS airtable_id,
  DROP COLUMN IF EXISTS client_stage,
  DROP COLUMN IF EXISTS total_cash_collected,
  DROP COLUMN IF EXISTS demo_link,
  DROP COLUMN IF EXISTS discovery_link,
  DROP COLUMN IF EXISTS research,
  DROP COLUMN IF EXISTS strategy,
  DROP COLUMN IF EXISTS onboarding_status,
  DROP COLUMN IF EXISTS onboarding_started_at,
  DROP COLUMN IF EXISTS onboarding_completed_at,
  DROP COLUMN IF EXISTS calendar_config,
  DROP COLUMN IF EXISTS calendar_last_webhook,
  DROP COLUMN IF EXISTS calendar_webhook_count,
  DROP COLUMN IF EXISTS crm_config;
