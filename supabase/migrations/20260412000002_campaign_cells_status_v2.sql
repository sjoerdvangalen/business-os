-- Extend campaign_cells.status to include V2 lifecycle values
-- New lifecycle: sourcing_pending → sourcing_failed | ready → H1_testing → ...
-- These sit BEFORE the existing pilot_copy onwards in the lifecycle.

ALTER TABLE campaign_cells
  DROP CONSTRAINT IF EXISTS campaign_cells_status_check;

ALTER TABLE campaign_cells
  ADD CONSTRAINT campaign_cells_status_check
    CHECK (status IN (
      -- V2 sourcing lifecycle (new)
      'sourcing_pending',   -- skeleton created, awaiting sourcing feasibility
      'sourcing_failed',    -- sourcing infeasible — no messaging generated
      'ready',              -- sourcing approved, messaging enriched
      -- Existing execution lifecycle
      'draft',
      'pilot_copy',
      'H1_testing', 'H1_winner',
      'F1_testing', 'F1_winner',
      'CTA1_testing',
      'soft_launch', 'scaling', 'killed'
    ));

-- Also add cell_code unique index per client (upsert key)
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_cells_cell_code_client
  ON campaign_cells(cell_code, client_id);
