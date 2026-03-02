-- ============================================
-- RESET CLEANUP — Drop dead tables, rename, remove duplicates
-- From 17+ tables to 15 clean tables (12 business + 3 operational)
-- ============================================

-- ============================================
-- 1. DROP ALL VIEWS (they reference tables/columns being changed)
-- ============================================
DROP VIEW IF EXISTS v_inbox_health CASCADE;
DROP VIEW IF EXISTS v_domain_health CASCADE;
DROP VIEW IF EXISTS v_client_health CASCADE;
DROP VIEW IF EXISTS v_campaign_health_live CASCADE;
DROP VIEW IF EXISTS v_campaign_performance CASCADE;
DROP VIEW IF EXISTS v_lead_pipeline CASCADE;
DROP VIEW IF EXISTS v_sync_status CASCADE;

-- ============================================
-- 2. DROP DEAD TABLES (order matters for foreign keys)
-- ============================================

-- invoices references contracts(id), drop invoices first
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS contracts CASCADE;

-- onboarding tables (no FK dependencies)
DROP TABLE IF EXISTS onboarding_logs CASCADE;
DROP TABLE IF EXISTS onboardings CASCADE;

-- n8n legacy
DROP TABLE IF EXISTS runs CASCADE;

-- multi-tenant (not needed now)
DROP TABLE IF EXISTS client_users CASCADE;

-- warmup_snapshots references email_accounts, drop before rename
DROP TABLE IF EXISTS warmup_snapshots CASCADE;

-- ============================================
-- 3. RENAME TABLES
-- ============================================

-- email_accounts → email_inboxes
ALTER TABLE email_accounts RENAME TO email_inboxes;

-- email_messages → email_threads
ALTER TABLE email_messages RENAME TO email_threads;

-- sequences → email_sequences
ALTER TABLE sequences RENAME TO email_sequences;

-- ============================================
-- 4. DROP DUPLICATE COLUMNS
-- ============================================

-- domains: spf_valid/dkim_valid/dmarc_valid → keep spf_status/dkim_status/dmarc_status
ALTER TABLE domains DROP COLUMN IF EXISTS spf_valid;
ALTER TABLE domains DROP COLUMN IF EXISTS dkim_valid;
ALTER TABLE domains DROP COLUMN IF EXISTS dmarc_valid;

-- contacts: lead_source → keep source
ALTER TABLE contacts DROP COLUMN IF EXISTS lead_source;

-- contacts: status → keep lead_status (rename index)
DROP INDEX IF EXISTS idx_contacts_status;
ALTER TABLE contacts DROP COLUMN IF EXISTS status;
CREATE INDEX IF NOT EXISTS idx_contacts_lead_status ON contacts(lead_status);

-- ============================================
-- 5. ADD WARMUP COLUMNS TO email_inboxes (replaces warmup_snapshots)
-- ============================================
ALTER TABLE email_inboxes ADD COLUMN IF NOT EXISTS latest_inbox_rate NUMERIC(5,2);
ALTER TABLE email_inboxes ADD COLUMN IF NOT EXISTS latest_spam_rate NUMERIC(5,2);
ALTER TABLE email_inboxes ADD COLUMN IF NOT EXISTS warmup_last_checked TIMESTAMPTZ;

-- ============================================
-- 6. MEETINGS — add Cal.com fields
-- ============================================
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS calcom_booking_id TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS calcom_event_type TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS booking_status TEXT DEFAULT 'booked';
-- booked | cancelled | rescheduled | completed | no_show
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS attendee_email TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS attendee_name TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS review_notes TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_calcom
  ON meetings(calcom_booking_id) WHERE calcom_booking_id IS NOT NULL;

-- ============================================
-- 7. OKRs TABLE (new)
-- ============================================
CREATE TABLE IF NOT EXISTS okrs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  period TEXT NOT NULL,
  objective TEXT NOT NULL,
  key_result TEXT NOT NULL,
  target_value NUMERIC,
  current_value NUMERIC DEFAULT 0,
  unit TEXT,
  status TEXT DEFAULT 'on_track',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_okrs_client ON okrs(client_id);
CREATE INDEX IF NOT EXISTS idx_okrs_period ON okrs(period);

-- ============================================
-- 8. RENAME INDEXES to match new table names
-- ============================================
DROP INDEX IF EXISTS idx_email_accounts_email;
DROP INDEX IF EXISTS idx_email_accounts_client;
DROP INDEX IF EXISTS idx_email_accounts_plusvibe;
CREATE INDEX IF NOT EXISTS idx_email_inboxes_email ON email_inboxes(email);
CREATE INDEX IF NOT EXISTS idx_email_inboxes_client ON email_inboxes(client_id);
CREATE INDEX IF NOT EXISTS idx_email_inboxes_plusvibe ON email_inboxes(plusvibe_id);

DROP INDEX IF EXISTS idx_email_messages_contact;
DROP INDEX IF EXISTS idx_email_messages_thread;
CREATE INDEX IF NOT EXISTS idx_email_threads_contact ON email_threads(contact_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_thread ON email_threads(thread_id);

DROP INDEX IF EXISTS idx_sequences_campaign;
CREATE INDEX IF NOT EXISTS idx_email_sequences_campaign ON email_sequences(campaign_id);

-- warmup_snapshots index is gone with the table
DROP INDEX IF EXISTS idx_warmup_account_date;

-- ============================================
-- 9. RECREATE VIEWS (clean, no dead refs)
-- ============================================

-- Campaign performance
CREATE OR REPLACE VIEW v_campaign_performance AS
SELECT
  ca.id,
  ca.name,
  cl.name as client,
  cl.client_code,
  ca.status,
  ca.total_leads,
  ca.emails_sent,
  ca.replies,
  ca.positive_replies,
  ca.reply_rate,
  ca.bounce_rate,
  ca.positive_rate,
  ca.health_status,
  ca.last_synced_at
FROM campaigns ca
LEFT JOIN clients cl ON cl.id = ca.client_id;

-- Campaign health (live)
CREATE OR REPLACE VIEW v_campaign_health_live AS
SELECT
  c.id,
  c.name,
  c.client_id,
  cl.name as client_name,
  cl.client_code,
  c.status,
  c.health_status,
  c.emails_sent as total_sent,
  c.replies as total_replies,
  c.bounces as total_bounces,
  c.reply_rate,
  c.bounce_rate,
  c.open_rate,
  c.positive_replies,
  c.unsubscribes,
  c.last_health_check,
  c.alert_count,
  CASE
    WHEN c.emails_sent > 100 AND c.bounce_rate > 5 THEN 'CRITICAL'
    WHEN c.emails_sent > 500 AND c.reply_rate < 0.5 THEN 'CRITICAL'
    WHEN c.emails_sent > 100 AND c.bounce_rate > 3 THEN 'WARNING'
    WHEN c.emails_sent > 500 AND c.reply_rate < 1 THEN 'WARNING'
    WHEN c.emails_sent < 50 THEN 'UNKNOWN'
    ELSE 'HEALTHY'
  END as computed_health
FROM campaigns c
JOIN clients cl ON c.client_id = cl.id
WHERE c.status = 'ACTIVE';

-- Client health (no more invoices reference)
CREATE OR REPLACE VIEW v_client_health AS
SELECT
  cl.client_code,
  cl.name,
  cl.client_stage,
  COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'ACTIVE') as active_campaigns,
  COALESCE(SUM(c.emails_sent), 0) as total_sent,
  COALESCE(SUM(c.replies), 0) as total_replies,
  COALESCE(SUM(c.positive_replies), 0) as total_positive,
  COALESCE(SUM(c.bounces), 0) as total_bounces,
  CASE
    WHEN SUM(c.emails_sent) > 0
    THEN ROUND(SUM(c.replies)::numeric / SUM(c.emails_sent) * 100, 2)
    ELSE 0
  END as reply_rate,
  CASE
    WHEN SUM(c.emails_sent) > 0
    THEN ROUND(SUM(c.bounces)::numeric / SUM(c.emails_sent) * 100, 2)
    ELSE 0
  END as bounce_rate,
  COUNT(DISTINCT c.id) FILTER (WHERE c.health_status = 'CRITICAL') as critical_campaigns,
  COUNT(DISTINCT c.id) FILTER (WHERE c.health_status = 'WARNING') as warning_campaigns
FROM clients cl
LEFT JOIN campaigns c ON c.client_id = cl.id
WHERE cl.client_stage = 'Active'
GROUP BY cl.id, cl.client_code, cl.name, cl.client_stage;

-- Domain health (no spf_valid refs)
CREATE OR REPLACE VIEW v_domain_health AS
SELECT
  d.id,
  d.domain,
  d.provider,
  d.spf_status,
  d.dkim_status,
  d.dmarc_status,
  d.health_status,
  d.avg_inbox_rate,
  d.last_health_check,
  COUNT(ei.id) as inbox_count,
  COUNT(ei.id) FILTER (WHERE ei.status = 'connected') as connected_count,
  COUNT(ei.id) FILTER (WHERE ei.warmup_status = 'active') as warming_count,
  COUNT(ei.id) FILTER (WHERE ei.status = 'disconnected') as disconnected_count
FROM domains d
LEFT JOIN email_inboxes ei ON ei.domain_id = d.id
GROUP BY d.id, d.domain, d.provider, d.spf_status, d.dkim_status, d.dmarc_status,
         d.health_status, d.avg_inbox_rate, d.last_health_check;

-- Lead pipeline (uses lead_status now)
CREATE OR REPLACE VIEW v_lead_pipeline AS
SELECT
  lead_status as status,
  COUNT(*) as count,
  ROUND(COUNT(*)::DECIMAL / NULLIF(SUM(COUNT(*)) OVER(), 0) * 100, 1) as pct
FROM contacts
WHERE lead_status IS NOT NULL
GROUP BY lead_status;

-- Sync status
CREATE OR REPLACE VIEW v_sync_status AS
SELECT
  source, table_name, operation,
  records_processed, records_created, records_updated, records_failed,
  error_message, started_at, completed_at, duration_ms
FROM sync_log
ORDER BY started_at DESC
LIMIT 50;

-- ============================================
-- 10. UPDATE TRIGGERS (renamed tables)
-- ============================================
-- Drop old triggers on renamed tables
DROP TRIGGER IF EXISTS update_email_accounts_updated_at ON email_inboxes;
DROP TRIGGER IF EXISTS update_sequences_updated_at ON email_sequences;

-- Create triggers with correct names
CREATE TRIGGER update_email_inboxes_updated_at
  BEFORE UPDATE ON email_inboxes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_email_sequences_updated_at
  BEFORE UPDATE ON email_sequences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_okrs_updated_at
  BEFORE UPDATE ON okrs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Triggers for contracts/invoices were auto-dropped with DROP TABLE CASCADE

-- Recreate meetings trigger (table still exists, trigger may have wrong name)
DROP TRIGGER IF EXISTS update_meetings_updated_at ON meetings;
CREATE TRIGGER update_meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 11. RETENTION POLICIES (pg_cron cleanup jobs)
-- ============================================

-- sync_log: keep 30 days
SELECT cron.schedule(
  'cleanup-sync-log',
  '0 3 * * *',
  $$DELETE FROM sync_log WHERE started_at < NOW() - INTERVAL '30 days'$$
);

-- agent_memory: keep 90 days
SELECT cron.schedule(
  'cleanup-agent-memory',
  '0 3 * * *',
  $$DELETE FROM agent_memory WHERE created_at < NOW() - INTERVAL '90 days'$$
);

-- email_threads: strip bodies after 180 days (keep metadata)
SELECT cron.schedule(
  'cleanup-email-bodies',
  '0 4 * * *',
  $$UPDATE email_threads
    SET body_text = NULL, body_html = NULL
    WHERE sent_at < NOW() - INTERVAL '180 days'
    AND (body_text IS NOT NULL OR body_html IS NOT NULL)$$
);

-- Indexes to support efficient cleanup
CREATE INDEX IF NOT EXISTS idx_sync_log_started_at ON sync_log(started_at);
CREATE INDEX IF NOT EXISTS idx_agent_memory_created_at ON agent_memory(created_at);
CREATE INDEX IF NOT EXISTS idx_email_threads_sent_at ON email_threads(sent_at);
