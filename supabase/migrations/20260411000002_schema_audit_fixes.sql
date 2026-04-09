-- Schema Audit Fixes: CHECK constraints + DNC global unique index
-- Fixes code-schema mismatches found during audit

-- 1. DNC reason: 'bounce' canonical (no hard/soft distinction from EmailBison)
ALTER TABLE dnc_entities DROP CONSTRAINT IF EXISTS dnc_entities_reason_check;
ALTER TABLE dnc_entities ADD CONSTRAINT dnc_entities_reason_check
  CHECK (reason IN ('bounce','unsubscribe','spam_complaint','manual_request','replied','meeting_booked'));

-- 2. email_inboxes status: extend with values used by webhook code
ALTER TABLE email_inboxes DROP CONSTRAINT IF EXISTS chk_inboxes_status;
ALTER TABLE email_inboxes ADD CONSTRAINT chk_inboxes_status
  CHECK (status IN ('connected','disconnected','bouncing','active','removed','paused','disabled'));

-- 3. alerts alert_type: add warmup event types
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_alert_type_check;
ALTER TABLE alerts ADD CONSTRAINT alerts_alert_type_check
  CHECK (alert_type IN (
    'bounce_rate_high','inbox_disconnected','volume_drop','reply_rate_drop',
    'domain_health','crm_sync_failed','no_meeting_outcomes','client_pacing_behind',
    'duplicate_lead_spike','domain_retirement_due',
    'warmup_causing_bounces','warmup_receiving_bounces'
  ));

-- 4. DNC global unique index (PostgreSQL NULL != NULL — upsert on global DNC fails without this)
CREATE UNIQUE INDEX IF NOT EXISTS idx_dnc_global_unique
  ON dnc_entities(entity_type, entity_value)
  WHERE client_id IS NULL;
