-- Add vertical_key to campaign_cells
-- vertical_key = sector dimension (staffing / saas / financial / healthcare / manufacturing)
-- icp_key = firmographic ICP segment (separate dimension — never equate these two)
-- Cell identity: solution_key + icp_key + vertical_key + persona_key

ALTER TABLE campaign_cells
  ADD COLUMN IF NOT EXISTS vertical_key TEXT;

-- Add status values for the new cell lifecycle
-- draft → sourcing_pending → sourcing_failed | ready → H1_testing → H1_winner → ...
-- The existing status column is TEXT, so we just document the expected values here.
-- Existing enum or check constraints on status should be verified separately.

COMMENT ON COLUMN campaign_cells.vertical_key IS
  'Sector dimension for the cell (e.g. staffing, saas, financial, healthcare, manufacturing). '
  'Distinct from icp_key which represents the firmographic ICP segment profile. '
  'Maps to gtm_synthesis_v2.verticals[].key';

COMMENT ON COLUMN campaign_cells.icp_key IS
  'ICP segment (firmographic profile) for the cell. '
  'Distinct from vertical_key which represents the sector. '
  'Maps to gtm_synthesis_v2.icp_segments[].name';
