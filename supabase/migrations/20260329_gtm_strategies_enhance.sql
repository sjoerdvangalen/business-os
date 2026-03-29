-- Add strategy details and campaign linkage
ALTER TABLE gtm_strategies
ADD COLUMN IF NOT EXISTS title text,
ADD COLUMN IF NOT EXISTS objectives text,
ADD COLUMN IF NOT EXISTS context text;

ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS strategy_id uuid REFERENCES gtm_strategies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_strategy_id ON campaigns(strategy_id);
