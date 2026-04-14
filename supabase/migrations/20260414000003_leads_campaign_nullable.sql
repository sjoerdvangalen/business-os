-- Make leads.campaign_id nullable to support pre-campaign cell linking
-- This allows contacts to be associated with a campaign_cell before the EmailBison campaign is created

ALTER TABLE leads
  ALTER COLUMN campaign_id DROP NOT NULL;

-- Unique constraint: a contact can only be linked once to a specific cell
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_contact_cell_unique
  ON leads(contact_id, cell_id)
  WHERE cell_id IS NOT NULL;

-- Index for fast lookup of contacts by cell_id
CREATE INDEX IF NOT EXISTS idx_leads_cell_contact
  ON leads(cell_id, contact_id)
  WHERE cell_id IS NOT NULL;
