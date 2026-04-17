-- Campaign cells: archetype, signal_tier, hook/offer/cta variant columns
-- contacts: enriched_at (fix for ai-enrich-contact bug)

ALTER TABLE campaign_cells
  ADD COLUMN IF NOT EXISTS campaign_archetype TEXT
    CHECK (campaign_archetype IN ('matrix_driven', 'data_driven', 'signal_driven'))
    DEFAULT 'matrix_driven',
  ADD COLUMN IF NOT EXISTS signal_tier INTEGER
    CHECK (signal_tier BETWEEN 1 AND 4)
    DEFAULT 3,
  ADD COLUMN IF NOT EXISTS hook_variant TEXT
    CHECK (hook_variant IN (
      'signal_observation', 'data_observation', 'problem_hypothesis',
      'poke_the_bear', 'benchmark_gap', 'proof_led'
    )),
  ADD COLUMN IF NOT EXISTS offer_variant TEXT
    CHECK (offer_variant IN (
      'outcome_led', 'problem_led', 'insight_led', 'proof_led', 'diagnostic_led'
    )),
  ADD COLUMN IF NOT EXISTS cta_variant TEXT
    CHECK (cta_variant IN (
      'direct_meeting', 'info_send', 'case_study_send', 'diagnostic_offer', 'soft_confirm'
    ));

-- contacts: enriched_at was missing from schema (ai-enrich-contact wrote to this column but it didn't exist)
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;

-- Add messaging_revision to campaign_cells status
-- Current status check: sourcing_pending | sourcing_failed | ready | H1_testing | H1_winner
--   | F1_testing | F1_winner | CTA1_testing | soft_launch | scaling | killed
-- We need to add messaging_revision
DO $$
BEGIN
  -- Drop and recreate the status constraint to include messaging_revision
  ALTER TABLE campaign_cells DROP CONSTRAINT IF EXISTS campaign_cells_status_check;
  ALTER TABLE campaign_cells ADD CONSTRAINT campaign_cells_status_check
    CHECK (status IN (
      'sourcing_pending', 'sourcing_failed',
      'messaging_revision',
      'ready',
      'H1_testing', 'H1_winner',
      'F1_testing', 'F1_winner',
      'CTA1_testing',
      'soft_launch', 'scaling', 'killed'
    ));
END $$;
