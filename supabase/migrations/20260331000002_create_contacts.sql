-- ============================================
-- UNIFIED DATA MODEL - Part 2: Contacts
-- Creates unified contacts table (replaces leads)
-- NOTE: Drops existing contacts table (scaffolding) and recreates
-- ============================================

-- Drop existing scaffolding contacts table if exists
-- (This was created in 20260312000000_restructure_tables.sql but never used)
DROP TABLE IF EXISTS contacts CASCADE;

-- Drop dependent objects from old schema
DROP INDEX IF EXISTS idx_contacts_client;
DROP INDEX IF EXISTS idx_contacts_lead;
DROP INDEX IF EXISTS idx_contacts_status;

CREATE TABLE contacts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- Persoonlijke info
  first_name            TEXT,
  last_name             TEXT,
  full_name             TEXT GENERATED ALWAYS AS (TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))) STORED,

  -- Contactgegevens
  email                 TEXT,
  email_verified        BOOLEAN DEFAULT FALSE,
  email_verified_at     TIMESTAMPTZ,
  phone                 TEXT,

  -- Professional
  title                 TEXT,                  -- functie titel
  position              TEXT,                  -- seniority level
  department            TEXT,
  linkedin_url          TEXT,

  -- Client koppeling (voor client_viewer restricties)
  client_id             UUID REFERENCES clients(id) ON DELETE SET NULL,

  -- Status lifecycle
  contact_status        TEXT NOT NULL DEFAULT 'new'
                          CHECK (contact_status IN (
                            'new',                    -- nog nooit gebruikt
                            'targeted',               -- in active campaign
                            'responded',              -- heeft gereageerd
                            'meeting_booked',         -- meeting geboekt
                            'qualified',              -- goedgekeurd meeting
                            'not_interested',         -- expliciet nee
                            'unsubscribed',           -- afgemeld
                            'bounced',                -- email bounced
                            'do_not_contact'          -- blacklist
                          )),

  -- Targeting geschiedenis (HERGEBRUIK!)
  first_targeted_at     TIMESTAMPTZ,            -- eerste keer gebruikt
  last_targeted_at      TIMESTAMPTZ,            -- laatste keer gebruikt
  times_targeted        INT DEFAULT 0,          -- hoe vaak gebruikt
  last_campaign_id      UUID REFERENCES campaigns(id),

  -- Response tracking
  first_reply_at        TIMESTAMPTZ,
  last_reply_at         TIMESTAMPTZ,
  reply_count           INT DEFAULT 0,

  -- Meeting tracking
  meetings_booked_count INT DEFAULT 0,
  meetings_held_count   INT DEFAULT 0,

  -- Source tracking
  source                TEXT NOT NULL DEFAULT 'manual',
  source_id             TEXT,                   -- originele ID (plusvibe_lead_id, etc)

  -- Enrichment
  enrichment_data       JSONB DEFAULT '{}',     -- AI enrichment, Apollo data

  -- Cooldown / Hergebruik
  available_for_reuse_after TIMESTAMPTZ,        -- wanneer mag opnieuw gebruikt
  reuse_cooldown_days   INT DEFAULT 90,         -- standaard 90 dagen

  -- Timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unieke constraints
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_linkedin ON contacts(linkedin_url) WHERE linkedin_url IS NOT NULL;

-- Performance indexen
CREATE INDEX IF NOT EXISTS idx_contacts_business ON contacts(business_id);
CREATE INDEX IF NOT EXISTS idx_contacts_client ON contacts(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(contact_status);
CREATE INDEX IF NOT EXISTS idx_contacts_source_id ON contacts(source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(full_name);

-- Hergebruik index
CREATE INDEX IF NOT EXISTS idx_contacts_available ON contacts(available_for_reuse_after, times_targeted)
  WHERE contact_status IN ('new', 'qualified', 'not_interested');

-- Campaign targeting index
CREATE INDEX IF NOT EXISTS idx_contacts_campaign ON contacts(last_campaign_id) WHERE last_campaign_id IS NOT NULL;

-- Reply tracking index
CREATE INDEX IF NOT EXISTS idx_contacts_reply ON contacts(last_reply_at) WHERE last_reply_at IS NOT NULL;

-- Updated at trigger
DROP TRIGGER IF EXISTS contacts_updated_at ON contacts;
CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency staff see all contacts" ON contacts
  FOR SELECT USING (current_user_role() IN ('agency_admin', 'agency_staff'));

CREATE POLICY "client viewer sees own contacts" ON contacts
  FOR SELECT USING (
    current_user_role() = 'client_viewer'
    AND client_id = current_user_client_id()
  );

CREATE POLICY "agency admin manage contacts" ON contacts
  FOR ALL USING (current_user_role() = 'agency_admin');

CREATE POLICY "agency staff insert contacts" ON contacts
  FOR INSERT WITH CHECK (current_user_role() IN ('agency_admin', 'agency_staff'));

CREATE POLICY "agency staff update own contacts" ON contacts
  FOR UPDATE USING (current_user_role() IN ('agency_admin', 'agency_staff'));

COMMENT ON TABLE contacts IS 'Unified contact storage - all people, targetable and reusable';
