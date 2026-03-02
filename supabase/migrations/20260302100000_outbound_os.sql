-- Outbound Operating System — Database Extensions
-- Adds columns for monitoring, classification, and reporting agents

-- ============================================================
-- contacts — reply classification + routing
-- ============================================================
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS reply_classification TEXT;
-- NOT_INTERESTED | BLOCKLIST | FUTURE_REQUEST | MEETING_REQUEST | INFO_REQUEST | OOO | POSITIVE | NEUTRAL
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS follow_up_date DATE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_status TEXT;
-- new | contacted | replied | interested | meeting_booked | closed | unsubscribed | blocklisted
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source TEXT;
-- manual | csv_import | clay | apollo | plusvibe

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_plusvibe_lead
  ON contacts(plusvibe_lead_id) WHERE plusvibe_lead_id IS NOT NULL;

-- ============================================================
-- email_messages — webhook event tracking
-- ============================================================
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS email_type TEXT;
-- campaign | reply | forward | bounce
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS webhook_event TEXT;
-- ALL_EMAIL_REPLIES | BOUNCED_EMAIL | EMAIL_SENT
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS webhook_received_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_messages_plusvibe
  ON email_messages(plusvibe_id) WHERE plusvibe_id IS NOT NULL;

-- ============================================================
-- daily_kpis — extended metrics
-- ============================================================
ALTER TABLE daily_kpis ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id);
ALTER TABLE daily_kpis ADD COLUMN IF NOT EXISTS interested_count INTEGER DEFAULT 0;
ALTER TABLE daily_kpis ADD COLUMN IF NOT EXISTS meeting_count INTEGER DEFAULT 0;
ALTER TABLE daily_kpis ADD COLUMN IF NOT EXISTS unsubscribe_count INTEGER DEFAULT 0;
ALTER TABLE daily_kpis ADD COLUMN IF NOT EXISTS interested_rate NUMERIC(5,4);
ALTER TABLE daily_kpis ADD COLUMN IF NOT EXISTS cost_per_meeting NUMERIC(10,2);

-- Drop old unique constraint if it only covers (date, client_id) and add one that includes campaign_id
-- We keep the old one and add a new one for campaign-level aggregation
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_kpis_campaign
  ON daily_kpis(date, campaign_id) WHERE campaign_id IS NOT NULL;

-- ============================================================
-- campaigns — health monitoring
-- ============================================================
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS health_status TEXT DEFAULT 'UNKNOWN';
-- HEALTHY | WARNING | CRITICAL | UNKNOWN
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS last_health_check TIMESTAMPTZ;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS alert_count INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS monitoring_notes JSONB DEFAULT '[]';

-- ============================================================
-- domains — deliverability monitoring
-- ============================================================
ALTER TABLE domains ADD COLUMN IF NOT EXISTS spf_status TEXT;
-- pass | fail | missing
ALTER TABLE domains ADD COLUMN IF NOT EXISTS dkim_status TEXT;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS dmarc_status TEXT;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS health_status TEXT DEFAULT 'UNKNOWN';
ALTER TABLE domains ADD COLUMN IF NOT EXISTS avg_inbox_rate NUMERIC(5,2);

-- ============================================================
-- clients — reporting
-- ============================================================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS report_frequency TEXT DEFAULT 'weekly';
-- weekly | biweekly | monthly
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_report_sent_at TIMESTAMPTZ;

-- ============================================================
-- sequences — performance tracking
-- ============================================================
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS performance_score NUMERIC(5,2);
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS last_evaluated_at TIMESTAMPTZ;
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS auto_paused BOOLEAN DEFAULT false;
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS pause_reason TEXT;

-- ============================================================
-- Views
-- ============================================================

-- Campaign health — live 7-day rolling stats
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
  c.negative_replies,
  c.unsubscribes,
  c.total_leads,
  c.leads_contacted,
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

-- Client health — 30-day aggregated view
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
  COUNT(DISTINCT c.id) FILTER (WHERE c.health_status = 'WARNING') as warning_campaigns,
  (SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE client_id = cl.id AND status = 'paid'
   AND created_at >= CURRENT_DATE - 90) as revenue_90d
FROM clients cl
LEFT JOIN campaigns c ON c.client_id = cl.id
WHERE cl.client_stage = 'Active'
GROUP BY cl.id, cl.client_code, cl.name, cl.client_stage;

-- Domain health
CREATE OR REPLACE VIEW v_domain_health AS
SELECT
  d.id,
  d.domain,
  d.provider,
  d.spf_valid,
  d.dkim_valid,
  d.dmarc_valid,
  d.spf_status,
  d.dkim_status,
  d.dmarc_status,
  d.health_status,
  d.avg_inbox_rate,
  d.last_health_check,
  COUNT(ea.id) as account_count,
  COUNT(ea.id) FILTER (WHERE ea.status = 'connected') as connected_count,
  COUNT(ea.id) FILTER (WHERE ea.warmup_status = 'active') as warming_count,
  COUNT(ea.id) FILTER (WHERE ea.status = 'disconnected') as disconnected_count
FROM domains d
LEFT JOIN email_accounts ea ON ea.domain_id = d.id
GROUP BY d.id, d.domain, d.provider, d.spf_valid, d.dkim_valid, d.dmarc_valid,
         d.spf_status, d.dkim_status, d.dmarc_status, d.health_status,
         d.avg_inbox_rate, d.last_health_check;
