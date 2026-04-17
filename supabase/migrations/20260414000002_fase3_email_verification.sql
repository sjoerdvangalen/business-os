-- Fase 3: Email verification + cell routing columns

-- contacts: catchall flag (null = not checked, true = catchall, false = confirmed not catchall)
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS email_catchall BOOLEAN DEFAULT NULL;

-- leads: cell_id FK (links a lead to the campaign cell it was sourced for)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS cell_id UUID REFERENCES campaign_cells(id) ON DELETE SET NULL;

-- campaigns: cell_id FK (links an EmailBison campaign to its campaign cell)
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS cell_id UUID REFERENCES campaign_cells(id) ON DELETE SET NULL;

-- Index for cell-scoped lead queries
CREATE INDEX IF NOT EXISTS leads_cell_id_idx ON leads(cell_id) WHERE cell_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS campaigns_cell_id_idx ON campaigns(cell_id) WHERE cell_id IS NOT NULL;
