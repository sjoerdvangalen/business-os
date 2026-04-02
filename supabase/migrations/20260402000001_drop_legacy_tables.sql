-- ============================================
-- Interaction layer: rename contact_campaigns → leads
--
-- Data model:
--   companies → contacts (person pool) → leads (contact × campaign × client)
--
-- contact_campaigns had the right FKs but wrong name + missing columns.
-- Old leads (PlusVibe sync dump) was already dropped in a prior partial migration.
-- email_cache, webhook_logs, agent_memory were also already dropped.
-- ============================================

-- ── 1. Rename contact_campaigns → leads ──
ALTER TABLE contact_campaigns RENAME TO leads;

-- ── 2. Rename campaign_status → status ──
ALTER TABLE leads RENAME COLUMN campaign_status TO status;

-- ── 3. Add missing interaction tracking columns ──
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS reply_count       INT          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reply_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reply_classification TEXT,
  ADD COLUMN IF NOT EXISTS label             TEXT,
  ADD COLUMN IF NOT EXISTS opened_count      INT          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bounced           BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sender_email      TEXT,
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now();

-- ── 4. Index for common lookups ──
CREATE INDEX IF NOT EXISTS idx_leads_contact    ON leads(contact_id);
CREATE INDEX IF NOT EXISTS idx_leads_campaign   ON leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_client     ON leads(client_id);
CREATE INDEX IF NOT EXISTS idx_leads_status     ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_plusvibe   ON leads(plusvibe_lead_id);
