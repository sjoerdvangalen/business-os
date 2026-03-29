-- ============================================
-- BUSINESS OS SCHEMA — Enhance existing tables + create new ones
-- Existing: clients(17), campaigns(38), contacts(3571), accounts(3043),
--           domains(0), inboxes(0), contracts, invoices, meetings,
--           opportunities, email_messages, onboardings, onboarding_logs, runs
-- ============================================

-- ============================================
-- ALTER EXISTING TABLES — add missing columns
-- ============================================

-- CLIENTS: existing cols = id, name, domain, status, language, crm_type, calendar_type, created_at, client_code
ALTER TABLE clients ADD COLUMN IF NOT EXISTS airtable_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_stage TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS total_cash_collected DECIMAL(12,2) DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS demo_link TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS discovery_link TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS slack_channel_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- CAMPAIGNS: existing cols = id, client_id, external_campaign_id, status, language, channel, created_at, name
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS plusvibe_id TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS campaign_type TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS total_leads INT DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS leads_contacted INT DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS leads_completed INT DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS emails_sent INT DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS unique_opens INT DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS replies INT DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS positive_replies INT DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS neutral_replies INT DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS negative_replies INT DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS bounces INT DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS unsubscribes INT DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS open_rate DECIMAL(5,2);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS reply_rate DECIMAL(5,2);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS bounce_rate DECIMAL(5,2);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS positive_rate DECIMAL(5,2);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS daily_limit INT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS send_priority INT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS stop_on_reply BOOLEAN DEFAULT TRUE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS opportunity_value DECIMAL(10,2);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS last_lead_sent TIMESTAMPTZ;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS last_lead_replied TIMESTAMPTZ;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- CONTACTS: existing cols = id, account_id, client_id, email, full_name, linkedin_url, status,
--           last_reply_at, created_at, first_name, last_name, plusvibe_lead_id, plusvibe_campaign_id,
--           position, phone, sender_email, email_history, cc_email, is_first_reply, company
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company_website TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_source TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS opened_count INT DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS replied_count INT DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS bounced BOOLEAN DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS bounce_message TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS mx_type TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_score INT DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- DOMAINS: exists but empty — add missing cols
ALTER TABLE domains ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);
ALTER TABLE domains ADD COLUMN IF NOT EXISTS forward_domain TEXT;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS bought_date DATE;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS expiration_date DATE;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS spf_valid BOOLEAN;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS dkim_valid BOOLEAN;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS dmarc_valid BOOLEAN;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS last_health_check TIMESTAMPTZ;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE domains ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- CONTRACTS
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_name TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS duration_months INT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS auto_renewal BOOLEAN DEFAULT FALSE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS retainer DECIMAL(10,2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS meeting_fee DECIMAL(10,2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS commission_pct DECIMAL(5,2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS sent_date DATE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signed_date DATE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- INVOICES
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES contracts(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_name TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_type TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_excl_vat DECIMAL(10,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS vat_pct DECIMAL(5,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS vat_amount DECIMAL(10,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EUR';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_date DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_date DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_link TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- MEETINGS
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id);
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- OPPORTUNITIES
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS value DECIMAL(12,2);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- EMAIL_MESSAGES
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS plusvibe_id TEXT;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS thread_id TEXT;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id);
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id);
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS direction TEXT;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS from_email TEXT;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS to_email TEXT;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS body_text TEXT;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS body_html TEXT;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS content_preview TEXT;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS is_unread BOOLEAN DEFAULT TRUE;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================
-- CREATE NEW TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  step_number INT,
  name TEXT,
  subject TEXT,
  body TEXT,
  variation TEXT,
  wait_time_days INT,
  is_active BOOLEAN DEFAULT TRUE,
  sent INT DEFAULT 0,
  replies INT DEFAULT 0,
  positive_replies INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plusvibe_id TEXT UNIQUE,
  client_id UUID REFERENCES clients(id),
  domain_id UUID REFERENCES domains(id),
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  provider TEXT,
  status TEXT,
  daily_limit INT,
  interval_limit_min INT,
  emails_sent_today INT DEFAULT 0,
  warmup_status TEXT,
  warmup_emails_sent_today INT DEFAULT 0,
  google_warmup_health DECIMAL(5,2),
  microsoft_warmup_health DECIMAL(5,2),
  overall_warmup_health DECIMAL(5,2),
  bounce_rate_3d DECIMAL(5,2),
  reply_rate_7d DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS daily_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  date DATE NOT NULL,
  prospects_contacted INT DEFAULT 0,
  emails_sent INT DEFAULT 0,
  replies INT DEFAULT 0,
  bounces INT DEFAULT 0,
  positive_replies INT DEFAULT 0,
  meeting_requests INT DEFAULT 0,
  reply_rate DECIMAL(5,2),
  bounce_rate DECIMAL(5,2),
  positive_rate DECIMAL(5,2),
  meetings_booked INT DEFAULT 0,
  meetings_showed INT DEFAULT 0,
  meetings_no_show INT DEFAULT 0,
  proposals_sent INT DEFAULT 0,
  contracts_signed INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, client_id)
);

CREATE TABLE IF NOT EXISTS warmup_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_account_id UUID REFERENCES email_accounts(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  emails_sent INT,
  inbox_count INT,
  spam_count INT,
  promotion_count INT,
  inbox_rate DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email_account_id, date)
);

CREATE TABLE IF NOT EXISTS sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL,
  records_processed INT DEFAULT 0,
  records_created INT DEFAULT 0,
  records_updated INT DEFAULT 0,
  records_failed INT DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INT
);

CREATE TABLE IF NOT EXISTS agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  memory_type TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_clients_code ON clients(client_code);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_client ON campaigns(client_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_plusvibe ON campaigns(plusvibe_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_client ON contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_campaign ON contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_email ON email_accounts(email);
CREATE INDEX IF NOT EXISTS idx_email_accounts_client ON email_accounts(client_id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_plusvibe ON email_accounts(plusvibe_id);
CREATE INDEX IF NOT EXISTS idx_daily_kpis_date ON daily_kpis(date);
CREATE INDEX IF NOT EXISTS idx_daily_kpis_client_date ON daily_kpis(client_id, date);
CREATE INDEX IF NOT EXISTS idx_email_messages_contact ON email_messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_thread ON email_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_warmup_account_date ON warmup_snapshots(email_account_id, date);
CREATE INDEX IF NOT EXISTS idx_agent_memory_agent ON agent_memory(agent_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_sync_log_source ON sync_log(source, table_name);
CREATE INDEX IF NOT EXISTS idx_sequences_campaign ON sequences(campaign_id);

-- ============================================
-- AUTO-UPDATE TIMESTAMPS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'clients', 'campaigns', 'sequences', 'email_accounts',
      'domains', 'contacts', 'contracts', 'invoices',
      'meetings', 'opportunities'
    ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%s_updated_at ON %s', t, t);
    EXECUTE format(
      'CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
      t, t
    );
  END LOOP;
END;
$$;

-- ============================================
-- VIEWS - REMOVED
-- All views have been removed per security cleanup
-- See migration 20250327000001_security_fixes_drop_views.sql
-- ============================================

