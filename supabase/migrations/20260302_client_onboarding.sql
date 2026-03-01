-- ============================================
-- Client Onboarding Pipeline — extend existing tables
-- No new tables. JSONB columns on clients for research + strategy.
-- Sequences extended for copy metadata.
-- ============================================

-- CLIENTS: onboarding data
ALTER TABLE clients ADD COLUMN IF NOT EXISTS onboarding_form JSONB DEFAULT '{}';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS research JSONB DEFAULT '{}';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS strategy JSONB DEFAULT '{}';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS onboarding_status TEXT DEFAULT 'not_started';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS onboarding_started_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- SEQUENCES: copy context
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS offer_variant TEXT;
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS target_icp TEXT;
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS tone TEXT DEFAULT 'professional';
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS copy_status TEXT DEFAULT 'draft';
