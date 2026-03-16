-- Lead Generation Schema Extension
-- Voor: Google Maps scraping, email waterfall, AI enrichment

-- 1. COMPANIES TABLE
-- A-leads uit Google Maps scraping
CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id),

  -- Core data (uit Google Maps)
  name text NOT NULL,
  domain text,
  address text,
  phone text,
  website text,
  google_maps_url text,
  rating numeric(2,1),
  review_count integer,

  -- Location
  city text,
  zip_code text,
  country text DEFAULT 'NL',

  -- Categorisatie
  category text, -- "plumber", "marketing agency", etc.
  is_multi_location boolean DEFAULT false,

  -- Status
  status text DEFAULT 'new', -- new/scraped/enriched/qualified/disqualified

  -- Metadata
  scraped_at timestamptz DEFAULT now(),
  enriched_at timestamptz,

  -- Source tracking
  scraper_job_id text, -- linkt naar google-maps-scraper job

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes voor companies
CREATE INDEX idx_companies_client ON companies(client_id);
CREATE INDEX idx_companies_status ON companies(status);
CREATE INDEX idx_companies_domain ON companies(domain);
CREATE INDEX idx_companies_zip ON companies(zip_code);
CREATE INDEX idx_companies_scraper_job ON companies(scraper_job_id);

-- 2. EMAIL CACHE TABLE
-- 90-dagen cache voor email validaties
CREATE TABLE email_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifiers
  linkedin_slug text UNIQUE, -- linkedin.com/in/SLUG
  email text,

  -- Validatie info
  validation_source text, -- trykitt
  validation_method text, -- pattern/verify
  confidence_score integer, -- 0-100

  -- Status
  is_valid boolean,
  is_catch_all boolean DEFAULT false,

  -- TTL: 90 dagen
  validated_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '90 days'),

  -- Tracking
  lookup_count integer DEFAULT 1,
  last_lookup_at timestamptz DEFAULT now(),

  created_at timestamptz DEFAULT now()
);

-- Indexes voor email_cache
CREATE INDEX idx_email_cache_expires ON email_cache(expires_at);
CREATE INDEX idx_email_cache_slug ON email_cache(linkedin_slug);

-- 3. CONTACTS TABLE UITBREIDING
-- Nieuwe kolommen toevoegen aan bestaande contacts table

-- Lead generation tracking
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_source text; -- 'google_maps', 'manual'
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_source_id uuid REFERENCES companies(id);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS enrichment_data jsonb; -- AI enrichment resultaten
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_waterfall_log jsonb; -- Stappen die genomen zijn

-- Waterfall status
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_waterfall_status text DEFAULT 'pending';
-- pending/cache_hit/verified/failed

-- 4. AUTO-CLEANUP VOOR EMAIL CACHE
-- Dagelijkse cleanup van expired cache entries
SELECT cron.schedule(
  'cleanup-email-cache',
  '0 0 * * *', -- Elke dag om 00:00
  $$ DELETE FROM email_cache WHERE expires_at < now() $$
);

-- 5. TRIGGER VOOR updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_companies_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 6. RLS POLICIES
-- Alleen service_role heeft volledige toegang
-- Dashboard gebruikt service_role key

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_cache ENABLE ROW LEVEL SECURITY;

-- Service role bypass (voor edge functions)
CREATE POLICY "Service role full access" ON companies
    FOR ALL USING (true); -- Wordt aangepast wanneer RLS volledig geimplementeerd is

CREATE POLICY "Service role full access" ON email_cache
    FOR ALL USING (true);

-- Comment: In productie, gebruik: current_user = 'service_role'
-- CREATE POLICY "Service role only" ON companies
--     FOR ALL USING (current_user = 'service_role');
