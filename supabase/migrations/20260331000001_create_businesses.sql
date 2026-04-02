-- ============================================
-- UNIFIED DATA MODEL - Part 1: Businesses
-- Creates unified businesses table (replaces companies)
-- ============================================

CREATE TABLE IF NOT EXISTS businesses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificatie
  name                TEXT NOT NULL,
  domain              TEXT,                    -- hoofd domain
  website             TEXT,
  linkedin_url        TEXT,

  -- Locatie
  city                TEXT,
  state               TEXT,
  country             TEXT,

  -- Bedrijfsinfo
  industry            TEXT,
  sub_industry        TEXT,
  employee_count      INT,
  employee_range      TEXT,                    -- "11-50", "51-200", etc
  annual_revenue      TEXT,                    -- "$1M-$10M"

  -- Status
  business_type       TEXT NOT NULL DEFAULT 'prospect'
                        CHECK (business_type IN ('prospect', 'client', 'partner', 'competitor', 'do_not_target')),

  -- Source tracking
  source              TEXT NOT NULL DEFAULT 'manual'
                        CHECK (source IN ('gmaps_scraper', 'apollo', 'manual', 'import', 'referral')),
  source_id           TEXT,                    -- originele ID van source

  -- Hergebruik tracking
  first_seen_at       TIMESTAMPTZ DEFAULT now(),
  last_enriched_at    TIMESTAMPTZ,
  times_targeted      INT DEFAULT 0,           -- hoe vaak in campaigns gebruikt

  -- JSONB voor flexibele data
  enrichment_data     JSONB DEFAULT '{}',      -- clearbit, apollo, etc
  tags                TEXT[],

  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unieke constraints
CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_domain ON businesses(domain) WHERE domain IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_linkedin ON businesses(linkedin_url) WHERE linkedin_url IS NOT NULL;

-- Performance indexen
CREATE INDEX IF NOT EXISTS idx_businesses_name ON businesses(name);
CREATE INDEX IF NOT EXISTS idx_businesses_type ON businesses(business_type);
CREATE INDEX IF NOT EXISTS idx_businesses_industry ON businesses(industry);
CREATE INDEX IF NOT EXISTS idx_businesses_country ON businesses(country);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS businesses_updated_at ON businesses;
CREATE TRIGGER businesses_updated_at
  BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS (basic policies - extended in migration 05)
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency staff see all businesses" ON businesses
  FOR SELECT USING (current_user_role() IN ('agency_admin', 'agency_staff'));

CREATE POLICY "agency admin manage businesses" ON businesses
  FOR ALL USING (current_user_role() = 'agency_admin');

CREATE POLICY "agency staff insert businesses" ON businesses
  FOR INSERT WITH CHECK (current_user_role() IN ('agency_admin', 'agency_staff'));

COMMENT ON TABLE businesses IS 'Unified business storage - all companies, prospects, and clients';
