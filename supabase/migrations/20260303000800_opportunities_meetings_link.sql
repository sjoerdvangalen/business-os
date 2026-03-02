-- ============================================================
-- Link Opportunities ↔ Meetings + add missing columns
-- ============================================================

-- 1. Add campaign_id to opportunities (tracks which campaign generated it)
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id);

-- 2. Add meeting_id to opportunities (direct link to the meeting)
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS meeting_id UUID REFERENCES meetings(id);

-- 3. Add opportunity_id to meetings (reverse link)
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS opportunity_id UUID REFERENCES opportunities(id);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_opportunities_campaign ON opportunities(campaign_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_meeting ON opportunities(meeting_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_client ON opportunities(client_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_contact ON opportunities(contact_id);
CREATE INDEX IF NOT EXISTS idx_meetings_opportunity ON meetings(opportunity_id);
