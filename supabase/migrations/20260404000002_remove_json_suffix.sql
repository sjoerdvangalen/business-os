-- ═══════════════════════════════════════════════════════════════════════════
-- Remove _json suffix from gtm_strategies columns
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE gtm_strategies
  RENAME COLUMN solutions_json TO solutions;

ALTER TABLE gtm_strategies
  RENAME COLUMN pains_json TO pains;

ALTER TABLE gtm_strategies
  RENAME COLUMN icp_segments_json TO icp_segments;

ALTER TABLE gtm_strategies
  RENAME COLUMN buyer_personas_json TO buyer_personas;

ALTER TABLE gtm_strategies
  RENAME COLUMN entry_offers_json TO entry_offers;

ALTER TABLE gtm_strategies
  RENAME COLUMN proof_assets_json TO proof_assets;

ALTER TABLE gtm_strategies
  RENAME COLUMN messaging_direction_json TO messaging_direction;

ALTER TABLE gtm_strategies
  RENAME COLUMN research_context_json TO research_context;

ALTER TABLE gtm_strategies
  RENAME COLUMN onboarding_context_json TO onboarding_context;

-- Update comments (optional, removes old comments)
COMMENT ON COLUMN gtm_strategies.solutions IS NULL;
COMMENT ON COLUMN gtm_strategies.icp_segments IS NULL;
COMMENT ON COLUMN gtm_strategies.buyer_personas IS NULL;
COMMENT ON COLUMN gtm_strategies.entry_offers IS NULL;
