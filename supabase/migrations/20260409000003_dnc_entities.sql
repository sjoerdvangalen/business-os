-- DNC Entities Table (Do Not Contact)
-- Multi-layer suppression system for email outreach

CREATE TABLE IF NOT EXISTS dnc_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,  -- NULL = global (all clients)

  -- Entity type and value
  entity_type TEXT NOT NULL CHECK (entity_type IN ('email', 'domain', 'contact_id')),
  entity_value TEXT NOT NULL,

  -- Reason and source
  reason TEXT NOT NULL CHECK (reason IN (
    'hard_bounce', 'soft_bounce', 'unsubscribe', 'spam_complaint',
    'manual_request', 'replied', 'meeting_booked'
  )),
  source TEXT NOT NULL CHECK (source IN ('emailbison_webhook', 'manual', 'system')),

  -- Context references
  source_campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  source_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  source_lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,

  -- Timing (NULL = permanent, e.g., for bounces)
  expires_at TIMESTAMP,

  -- Bounce details (only for bounce reasons)
  bounce_details JSONB,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique constraint: one entity per client (or global)
  UNIQUE (client_id, entity_type, entity_value)
);

-- Indexes for fast lookups
CREATE INDEX idx_dnc_client_entity ON dnc_entities(client_id, entity_type, entity_value);
CREATE INDEX idx_dnc_global_email ON dnc_entities(entity_value) WHERE client_id IS NULL;
CREATE INDEX idx_dnc_expires ON dnc_entities(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_dnc_reason ON dnc_entities(reason);
CREATE INDEX idx_dnc_created ON dnc_entities(created_at);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_dnc_entities_updated_at ON dnc_entities;
CREATE TRIGGER update_dnc_entities_updated_at
  BEFORE UPDATE ON dnc_entities
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comment for documentation
COMMENT ON TABLE dnc_entities IS 'Do Not Contact entities - multi-layer suppression system';
COMMENT ON COLUMN dnc_entities.client_id IS 'NULL = global (applies to all clients), otherwise client-specific';
COMMENT ON COLUMN dnc_entities.expires_at IS 'NULL = permanent suppression (bounces), date = temporary (replies/meetings = 90 days)';
