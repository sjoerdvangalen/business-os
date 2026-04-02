-- ============================================
-- companies is the canonical account table.
-- businesses was a transitional duplicate — drop it.
--
-- Steps:
--   1. Add richer columns from businesses schema to companies
--   2. contacts.business_id → company_id (FK → companies)
--   3. Drop businesses
-- ============================================

-- ── 1. Add missing columns to companies ──

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS website          TEXT,
  ADD COLUMN IF NOT EXISTS city             TEXT,
  ADD COLUMN IF NOT EXISTS state            TEXT,
  ADD COLUMN IF NOT EXISTS country          TEXT,
  ADD COLUMN IF NOT EXISTS industry         TEXT,
  ADD COLUMN IF NOT EXISTS sub_industry     TEXT,
  ADD COLUMN IF NOT EXISTS employee_count   INT,
  ADD COLUMN IF NOT EXISTS employee_range   TEXT,
  ADD COLUMN IF NOT EXISTS annual_revenue   NUMERIC,
  ADD COLUMN IF NOT EXISTS business_type    TEXT,
  ADD COLUMN IF NOT EXISTS source           TEXT DEFAULT 'gmaps',
  ADD COLUMN IF NOT EXISTS source_id        TEXT,
  ADD COLUMN IF NOT EXISTS first_seen_at    TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS times_targeted   INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enrichment_data  JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tags             TEXT[] DEFAULT '{}';

-- ── 2. contacts: add company_id, migrate from business_id → companies ──

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

-- Migrate: contacts.business_id → businesses.domain → companies.id
UPDATE contacts c
SET company_id = comp.id
FROM businesses b
JOIN companies comp ON comp.domain = b.domain
WHERE c.business_id = b.id
  AND c.company_id IS NULL;

-- Drop RLS policies that reference business_id before dropping the column
DROP POLICY IF EXISTS "client viewer sees own businesses" ON businesses;
DROP POLICY IF EXISTS "agency staff see all businesses" ON businesses;
DROP POLICY IF EXISTS "agency admin manage businesses" ON businesses;
DROP POLICY IF EXISTS "agency staff insert businesses" ON businesses;

-- Drop old FK column (businesses will be dropped next)
ALTER TABLE contacts DROP COLUMN IF EXISTS business_id;

-- ── 3. Drop businesses ──

DROP TABLE IF EXISTS businesses CASCADE;
