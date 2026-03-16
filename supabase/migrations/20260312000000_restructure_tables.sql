-- ============================================================
-- Tabel Herstructurering + Lead Pool Setup
-- contacts → leads, accounts → companies
-- Nieuwe contacts tabel = gekwalificeerde relaties
-- Nieuwe tabellen: lead_pool, email_cache, mx_cache
-- ============================================================

-- ── Stap 1: Drop views (ze refereren tabel namen direct) ──
DROP VIEW IF EXISTS v_client_dashboard CASCADE;
DROP VIEW IF EXISTS v_meeting_pipeline CASCADE;
DROP VIEW IF EXISTS v_lead_funnel CASCADE;
DROP VIEW IF EXISTS v_infrastructure_health CASCADE;
DROP VIEW IF EXISTS v_sequence_performance CASCADE;

-- ── Stap 2: Rename tables ──
ALTER TABLE contacts RENAME TO leads;
ALTER TABLE accounts RENAME TO companies;

-- ── Stap 3: Rename FK columns ──
ALTER TABLE leads RENAME COLUMN account_id TO company_id;
ALTER TABLE email_threads RENAME COLUMN contact_id TO lead_id;
ALTER TABLE meetings RENAME COLUMN contact_id TO lead_id;
ALTER TABLE opportunities RENAME COLUMN contact_id TO lead_id;

-- ── Stap 4: Rename indexes (drop old, create new) ──
DROP INDEX IF EXISTS idx_contacts_email;
DROP INDEX IF EXISTS idx_contacts_client;
DROP INDEX IF EXISTS idx_contacts_campaign;
DROP INDEX IF EXISTS idx_contacts_account;
DROP INDEX IF EXISTS idx_contacts_lead_status;
DROP INDEX IF EXISTS idx_contacts_status;
DROP INDEX IF EXISTS idx_contacts_plusvibe_lead;
DROP INDEX IF EXISTS idx_accounts_domain;
DROP INDEX IF EXISTS idx_accounts_client;
DROP INDEX IF EXISTS idx_accounts_name;
DROP INDEX IF EXISTS idx_email_threads_contact;
DROP INDEX IF EXISTS idx_email_messages_contact;

CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_client ON leads(client_id);
CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_company ON leads(company_id);
CREATE INDEX IF NOT EXISTS idx_leads_lead_status ON leads(lead_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_plusvibe_lead ON leads(plusvibe_lead_id) WHERE plusvibe_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(domain);
CREATE INDEX IF NOT EXISTS idx_companies_client ON companies(client_id);
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);
CREATE INDEX IF NOT EXISTS idx_email_threads_lead ON email_threads(lead_id);

-- ── Stap 5: Enable RLS op renamed tables ──
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- ── Stap 6: Nieuwe contacts tabel (gekwalificeerde relaties) ──
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  company_id UUID REFERENCES companies(id),
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  position TEXT,
  phone TEXT,
  linkedin_url TEXT,
  contact_status TEXT DEFAULT 'qualified',
  qualified_at TIMESTAMPTZ DEFAULT NOW(),
  source_campaign_id UUID REFERENCES campaigns(id),
  deal_value NUMERIC(12,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_contacts_client ON contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_contacts_lead ON contacts(lead_id);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(contact_status);

-- ── Stap 7: lead_pool — Master lead database ──
CREATE TABLE IF NOT EXISTS lead_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  linkedin_url TEXT,
  first_name TEXT,
  last_name TEXT,
  position TEXT,
  phone TEXT,
  company_name TEXT,
  company_domain TEXT,
  company_website TEXT,
  industry TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  email_status TEXT DEFAULT 'unknown',
  email_validated_at TIMESTAMPTZ,
  email_found_by TEXT,
  email_validated_by TEXT,
  mx_provider TEXT,
  source TEXT NOT NULL,
  source_list TEXT,
  is_duplicate BOOLEAN DEFAULT FALSE,
  is_blocklisted BOOLEAN DEFAULT FALSE,
  enrichment_data JSONB DEFAULT '{}',
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE lead_pool ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_pool_email ON lead_pool(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_pool_linkedin ON lead_pool(linkedin_url) WHERE linkedin_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_pool_domain ON lead_pool(company_domain);
CREATE INDEX IF NOT EXISTS idx_lead_pool_status ON lead_pool(email_status);

-- ── Stap 8: email_cache — Gevonden emails met validatie datum ──
CREATE TABLE IF NOT EXISTS email_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  linkedin_url TEXT,
  full_name TEXT,
  company_domain TEXT,
  email TEXT NOT NULL,
  email_status TEXT NOT NULL,
  found_by TEXT NOT NULL,
  found_at TIMESTAMPTZ DEFAULT NOW(),
  validated_by TEXT,
  validated_at TIMESTAMPTZ,
  revalidation_due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE email_cache ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_email_cache_linkedin ON email_cache(linkedin_url);
CREATE INDEX IF NOT EXISTS idx_email_cache_domain ON email_cache(company_domain, full_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_cache_email ON email_cache(email, found_by);

-- ── Stap 9: mx_cache — MX records per domein ──
CREATE TABLE IF NOT EXISTS mx_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL UNIQUE,
  mx_provider TEXT,
  has_gateway BOOLEAN DEFAULT FALSE,
  gateway_type TEXT,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mx_cache ENABLE ROW LEVEL SECURITY;

-- ── Stap 10: Recreate views met nieuwe tabel namen ──
CREATE OR REPLACE VIEW v_client_dashboard AS
SELECT
  cl.id,
  cl.client_code,
  cl.name,
  cl.client_stage,
  cl.slack_channel_id,
  COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'ACTIVE') as active_campaigns,
  COUNT(DISTINCT c.id) as total_campaigns,
  COALESCE(SUM(c.emails_sent), 0) as total_emails_sent,
  COALESCE(SUM(c.replies), 0) as total_replies,
  COALESCE(SUM(c.positive_replies), 0) as total_positive_replies,
  COALESCE(SUM(c.bounces), 0) as total_bounces,
  CASE WHEN SUM(c.emails_sent) > 0
    THEN ROUND(SUM(c.replies)::numeric / SUM(c.emails_sent) * 100, 2)
    ELSE 0 END as reply_rate,
  CASE WHEN SUM(c.emails_sent) > 0
    THEN ROUND(SUM(c.bounces)::numeric / SUM(c.emails_sent) * 100, 2)
    ELSE 0 END as bounce_rate,
  COUNT(DISTINCT c.id) FILTER (WHERE c.health_status = 'CRITICAL') as critical_count,
  COUNT(DISTINCT c.id) FILTER (WHERE c.health_status = 'WARNING') as warning_count,
  CASE
    WHEN COUNT(c.id) FILTER (WHERE c.health_status = 'CRITICAL') > 0 THEN 'CRITICAL'
    WHEN COUNT(c.id) FILTER (WHERE c.health_status = 'WARNING') > 0 THEN 'WARNING'
    ELSE 'HEALTHY'
  END as overall_health,
  (SELECT COUNT(*) FROM email_inboxes ei WHERE ei.client_id = cl.id) as email_account_count,
  (SELECT COUNT(*) FROM email_inboxes ei WHERE ei.client_id = cl.id AND ei.status = 'connected') as connected_accounts,
  (SELECT COUNT(*) FROM domains d WHERE d.client_id = cl.id) as domain_count,
  (SELECT COUNT(*) FROM meetings m WHERE m.client_id = cl.id
   AND m.created_at >= CURRENT_DATE - 30) as meetings_30d,
  (SELECT COUNT(*) FROM meetings m WHERE m.client_id = cl.id
   AND m.created_at >= CURRENT_DATE - 30
   AND m.booking_status = 'qualified') as qualified_30d,
  (SELECT COUNT(*) FROM leads l WHERE l.client_id = cl.id) as total_leads,
  (SELECT COUNT(*) FROM leads l WHERE l.client_id = cl.id
   AND l.lead_status = 'interested') as interested_leads,
  (SELECT COUNT(*) FROM contacts ct WHERE ct.client_id = cl.id) as total_contacts
FROM clients cl
LEFT JOIN campaigns c ON c.client_id = cl.id
WHERE cl.client_stage = 'Active'
GROUP BY cl.id;

CREATE OR REPLACE VIEW v_meeting_pipeline AS
SELECT
  m.id,
  m.client_id,
  cl.name as client_name,
  cl.client_code,
  l.full_name as lead_name,
  l.email as lead_email,
  l.company,
  m.start_time,
  m.end_time,
  m.booking_status,
  m.review_status,
  m.review_notes,
  m.reviewed_at,
  m.recording_url,
  m.source,
  m.created_at,
  o.status as opportunity_status,
  o.value as opportunity_value
FROM meetings m
JOIN clients cl ON cl.id = m.client_id
LEFT JOIN leads l ON l.id = m.lead_id
LEFT JOIN opportunities o ON o.meeting_id = m.id
ORDER BY m.start_time DESC;

CREATE OR REPLACE VIEW v_lead_funnel AS
SELECT
  cl.client_code,
  cl.name as client_name,
  l.client_id,
  l.lead_status,
  COUNT(*) as count
FROM leads l
JOIN clients cl ON cl.id = l.client_id
WHERE l.lead_status IS NOT NULL
GROUP BY cl.client_code, cl.name, l.client_id, l.lead_status;

CREATE OR REPLACE VIEW v_infrastructure_health AS
SELECT
  cl.client_code,
  cl.name as client_name,
  cl.id as client_id,
  d.id as domain_id,
  d.domain,
  d.spf_status,
  d.dkim_status,
  d.dmarc_status,
  d.health_status as domain_health,
  d.avg_inbox_rate,
  COUNT(ei.id) as total_accounts,
  COUNT(ei.id) FILTER (WHERE ei.status = 'connected') as connected,
  COUNT(ei.id) FILTER (WHERE ei.status = 'disconnected') as disconnected,
  COUNT(ei.id) FILTER (WHERE ei.warmup_status = 'active') as warming,
  COALESCE(SUM(ei.daily_limit), 0) as total_daily_limit,
  ROUND(AVG(ei.latest_inbox_rate), 2) as avg_warmup_health,
  ROUND(AVG(ei.bounce_rate_3d), 2) as avg_bounce_rate
FROM domains d
JOIN clients cl ON cl.id = d.client_id
LEFT JOIN email_inboxes ei ON ei.domain_id = d.id
GROUP BY cl.client_code, cl.name, cl.id, d.id;

CREATE OR REPLACE VIEW v_sequence_performance AS
SELECT
  s.id,
  s.campaign_id,
  c.name as campaign_name,
  cl.client_code,
  s.step_number,
  s.name as step_name,
  s.variation,
  s.sent,
  s.replies,
  s.positive_replies,
  CASE WHEN s.sent > 0
    THEN ROUND(s.replies::numeric / s.sent * 100, 2)
    ELSE 0 END as reply_rate,
  CASE WHEN s.sent > 0
    THEN ROUND(s.positive_replies::numeric / s.sent * 100, 2)
    ELSE 0 END as positive_rate,
  s.is_active,
  s.auto_paused,
  s.pause_reason
FROM email_sequences s
JOIN campaigns c ON c.id = s.campaign_id
JOIN clients cl ON cl.id = c.client_id
ORDER BY cl.client_code, c.name, s.step_number;
