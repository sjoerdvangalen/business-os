-- ============================================
-- Drop GTM legacy tables (replaced by clients.gtm_synthesis JSONB)
--
-- buyer_personas     → clients.gtm_synthesis.personas
-- entry_offers       → clients.gtm_synthesis.entry_offers
-- gtm_strategies     → clients.gtm_synthesis
-- icp_segments       → clients.gtm_synthesis.icp_segments
-- proof_assets       → clients.gtm_synthesis
-- solutions          → clients.gtm_synthesis.solutions
-- campaign_plans     → clients.gtm_synthesis (1 test row, safe to drop)
-- campaign_runs      → campaign_cells.runs JSONB
-- campaign_variants  → campaign_cells.runs[].variants JSONB
-- mx_cache           → empty, was for domain lookup
-- ============================================

DROP TABLE IF EXISTS buyer_personas CASCADE;
DROP TABLE IF EXISTS entry_offers CASCADE;
DROP TABLE IF EXISTS gtm_strategies CASCADE;
DROP TABLE IF EXISTS icp_segments CASCADE;
DROP TABLE IF EXISTS proof_assets CASCADE;
DROP TABLE IF EXISTS solutions CASCADE;
DROP TABLE IF EXISTS campaign_plans CASCADE;
DROP TABLE IF EXISTS campaign_runs CASCADE;
DROP TABLE IF EXISTS campaign_variants CASCADE;
DROP TABLE IF EXISTS mx_cache CASCADE;
