-- Add synthesis JSONB column to gtm_strategies
-- This is the canonical write target for gtm-synthesis (v2).
-- Replaces the old separate JSONB columns (solutions_json, icp_segments_json, etc.)
-- which are kept for backwards compatibility but no longer written to.

ALTER TABLE gtm_strategies
  ADD COLUMN IF NOT EXISTS synthesis JSONB;

-- Update status check to match the approval_status values used in edge functions
-- Old: draft/synthesized/gate_review/gate_rejected/gate_approved/client_sent/client_iteration/client_approved
-- New: aligns with clients.approval_status enum values
ALTER TABLE gtm_strategies
  DROP CONSTRAINT IF EXISTS gtm_strategies_status_check;

ALTER TABLE gtm_strategies
  ADD CONSTRAINT gtm_strategies_status_check
    CHECK (status IN (
      'draft',
      'synthesized',
      'gate_review', 'gate_rejected', 'gate_approved',
      'client_sent', 'client_iteration', 'client_approved',
      -- V2 alignment with clients.approval_status enum
      'internal_review', 'internal_approved', 'internal_rejected',
      'external_sent', 'external_iteration', 'external_approved'
    ));

COMMENT ON COLUMN gtm_strategies.synthesis IS
  'V2 canonical synthesis JSONB (gtm_synthesis_v2 schema). '
  'Written by gtm-synthesis edge function. '
  'Fields: version, company_thesis, solutions, qualification_framework, '
  'icp_segments, buyer_personas, persona_map, persona_start_verbs, '
  'verticals, vertical_map, vertical_customer_terms, vertical_expert_terms, '
  'proof_assets, value_prop_formula, campaign_matrix_seed, '
  'messaging_direction, research_context, synthesized_at';
