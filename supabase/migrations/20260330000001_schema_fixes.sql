-- ============================================================
-- SCHEMA FIXES — 2026-03-30
-- 1. Fix pg_cron cleanup-email-bodies (body_html column was dropped)
-- 2. Restore critical FK indexes dropped in comprehensive_fixes
-- 3. Add missing performance indexes
-- 4. Add DEFAULT values on key status columns
-- 5. Add CHECK constraints on enum fields
-- ============================================================

-- ── 1. FIX PG_CRON CLEANUP-EMAIL-BODIES ──────────────────────
-- body_html was dropped in 20260305050000_remove_unused_columns.sql
-- The cron job still references it, causing nightly failures.

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-email-bodies');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-email-bodies',
  '0 4 * * *',
  $$UPDATE email_threads
    SET body_text = NULL
    WHERE sent_at < NOW() - INTERVAL '180 days'
    AND body_text IS NOT NULL$$
);

-- ── 2. RESTORE DROPPED FK INDEXES (dropped in comprehensive_fixes as "0 scans") ──
-- These were on scaffolding tables when dropped, but are now on active tables.

-- leads (27k rows)
CREATE INDEX IF NOT EXISTS idx_leads_client   ON leads(client_id);
CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_company  ON leads(company_id);

-- companies (17k rows)
CREATE INDEX IF NOT EXISTS idx_companies_client ON companies(client_id);
CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);

-- email_threads (46k rows)
CREATE INDEX IF NOT EXISTS idx_email_threads_lead ON email_threads(lead_id);

-- email_cache (dropped in comprehensive_fixes, needed by email-waterfall)
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_cache_slug
  ON email_cache(linkedin_slug) WHERE linkedin_slug IS NOT NULL;

-- ── 3. ADD MISSING PERFORMANCE INDEXES ───────────────────────

CREATE INDEX IF NOT EXISTS idx_leads_created_at
  ON leads(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_inboxes_status
  ON email_inboxes(status);

CREATE INDEX IF NOT EXISTS idx_email_inboxes_warmup_status
  ON email_inboxes(warmup_status);

CREATE INDEX IF NOT EXISTS idx_domains_health_status
  ON domains(health_status);

CREATE INDEX IF NOT EXISTS idx_meetings_booking_status
  ON meetings(booking_status);

CREATE INDEX IF NOT EXISTS idx_meetings_start_time
  ON meetings(start_time DESC);

-- ── 4. DEFAULT VALUES ON STATUS COLUMNS ──────────────────────
-- Prevent NULL values on operational state fields.

-- leads
ALTER TABLE leads
  ALTER COLUMN lead_status SET DEFAULT 'new';

-- email_inboxes (status/warmup_status may already have defaults, safe with SET)
ALTER TABLE email_inboxes
  ALTER COLUMN status SET DEFAULT 'connected',
  ALTER COLUMN warmup_status SET DEFAULT 'inactive';

-- domains (health_status already defaults to 'UNKNOWN' from 20260302100000, adding bounce_rate defaults)
ALTER TABLE campaigns
  ALTER COLUMN bounce_rate SET DEFAULT 0,
  ALTER COLUMN reply_rate  SET DEFAULT 0;

-- ── 5. CHECK CONSTRAINTS ON ENUM FIELDS ──────────────────────
-- Guards against invalid data at the DB level.
-- Skip tables with existing data until we can verify current values.

-- leads.lead_status: only add if no violation exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM leads
    WHERE lead_status NOT IN (
      'new','contacted','replied','interested',
      'meeting_booked','not_interested','blocklisted','completed','unsubscribed'
    )
    LIMIT 1
  ) THEN
    ALTER TABLE leads ADD CONSTRAINT chk_leads_lead_status
      CHECK (lead_status IN (
        'new','contacted','replied','interested',
        'meeting_booked','not_interested','blocklisted','completed','unsubscribed'
      ));
  ELSE
    RAISE NOTICE 'Skipping chk_leads_lead_status: existing rows with out-of-range values found';
  END IF;
END $$;

-- campaigns.status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM campaigns
    WHERE status NOT IN ('ACTIVE','PAUSED','INACTIVE')
    LIMIT 1
  ) THEN
    ALTER TABLE campaigns ADD CONSTRAINT chk_campaigns_status
      CHECK (status IN ('ACTIVE','PAUSED','INACTIVE'));
  ELSE
    RAISE NOTICE 'Skipping chk_campaigns_status: existing rows with out-of-range values found';
  END IF;
END $$;

-- campaigns.health_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM campaigns
    WHERE health_status NOT IN ('HEALTHY','WARNING','CRITICAL','UNKNOWN')
    LIMIT 1
  ) THEN
    ALTER TABLE campaigns ADD CONSTRAINT chk_campaigns_health_status
      CHECK (health_status IN ('HEALTHY','WARNING','CRITICAL','UNKNOWN'));
  ELSE
    RAISE NOTICE 'Skipping chk_campaigns_health_status: existing rows with out-of-range values found';
  END IF;
END $$;

-- email_inboxes.status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM email_inboxes
    WHERE status NOT IN ('connected','disconnected','bouncing')
    AND status IS NOT NULL
    LIMIT 1
  ) THEN
    ALTER TABLE email_inboxes ADD CONSTRAINT chk_inboxes_status
      CHECK (status IN ('connected','disconnected','bouncing'));
  ELSE
    RAISE NOTICE 'Skipping chk_inboxes_status: existing rows with out-of-range values found';
  END IF;
END $$;

-- domains DNS status columns — guard against out-of-range existing values
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_domains_spf')
     AND NOT EXISTS (SELECT 1 FROM domains WHERE spf_status NOT IN ('pass','fail','missing') AND spf_status IS NOT NULL LIMIT 1)
  THEN
    ALTER TABLE domains ADD CONSTRAINT chk_domains_spf
      CHECK (spf_status IN ('pass','fail','missing'));
  ELSE
    RAISE NOTICE 'Skipping chk_domains_spf: already exists or existing rows with out-of-range values found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_domains_dkim')
     AND NOT EXISTS (SELECT 1 FROM domains WHERE dkim_status NOT IN ('pass','fail','missing') AND dkim_status IS NOT NULL LIMIT 1)
  THEN
    ALTER TABLE domains ADD CONSTRAINT chk_domains_dkim
      CHECK (dkim_status IN ('pass','fail','missing'));
  ELSE
    RAISE NOTICE 'Skipping chk_domains_dkim: already exists or existing rows with out-of-range values found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_domains_dmarc')
     AND NOT EXISTS (SELECT 1 FROM domains WHERE dmarc_status NOT IN ('pass','fail','missing') AND dmarc_status IS NOT NULL LIMIT 1)
  THEN
    ALTER TABLE domains ADD CONSTRAINT chk_domains_dmarc
      CHECK (dmarc_status IN ('pass','fail','missing'));
  ELSE
    RAISE NOTICE 'Skipping chk_domains_dmarc: already exists or existing rows with out-of-range values found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_domains_health')
     AND NOT EXISTS (SELECT 1 FROM domains WHERE health_status NOT IN ('HEALTHY','WARNING','CRITICAL','UNKNOWN') AND health_status IS NOT NULL LIMIT 1)
  THEN
    ALTER TABLE domains ADD CONSTRAINT chk_domains_health
      CHECK (health_status IN ('HEALTHY','WARNING','CRITICAL','UNKNOWN'));
  ELSE
    RAISE NOTICE 'Skipping chk_domains_health: already exists or existing rows with out-of-range values found';
  END IF;
END $$;
