-- Drop DEPRECATED_READONLY columns from clients
-- icp_segments en campaign_cells zijn niet meer in gebruik
-- icp_segments zit in strategy_synthesis JSONB
-- campaign_cells zit in workflow_metrics JSONB

ALTER TABLE clients DROP COLUMN IF EXISTS icp_segments;
ALTER TABLE clients DROP COLUMN IF EXISTS campaign_cells;

DROP VIEW IF EXISTS clients_view;
