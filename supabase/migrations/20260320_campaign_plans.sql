-- GTM Campaign Plans — state machine voor orchestrator
-- Status: pending → review → approved → executing → completed
--         review → rejected
--         review → revision_needed → review

CREATE TABLE IF NOT EXISTS campaign_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  google_doc_id TEXT,
  google_doc_url TEXT,
  google_sheet_id TEXT,
  google_sheet_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'review', 'approved', 'executing', 'completed', 'rejected', 'revision_needed')),
  context JSONB DEFAULT '{}',
  execution_log JSONB DEFAULT '[]',
  stats JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_plans_status ON campaign_plans(status);
CREATE INDEX IF NOT EXISTS idx_campaign_plans_client ON campaign_plans(client_code);

CREATE OR REPLACE FUNCTION update_campaign_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_campaign_plans_updated_at ON campaign_plans;
CREATE TRIGGER trg_campaign_plans_updated_at
  BEFORE UPDATE ON campaign_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_campaign_plans_updated_at();
