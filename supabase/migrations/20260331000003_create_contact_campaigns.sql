-- ============================================
-- UNIFIED DATA MODEL - Part 3: Contact Campaigns
-- Linking table for many-to-many contacts <-> campaigns
-- ============================================

CREATE TABLE IF NOT EXISTS contact_campaigns (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id          UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_id         UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Campaign specifieke status
  campaign_status     TEXT NOT NULL DEFAULT 'added'
                        CHECK (campaign_status IN (
                          'added',           -- toegevoegd aan campaign
                          'pending',         -- wacht op verificatie
                          'sent',            -- eerste email verstuurd
                          'replied',         -- heeft gereageerd
                          'meeting_booked',  -- meeting geboekt
                          'completed',       -- afgerond (qualified/unqualified)
                          'bounced',         -- email bounced
                          'unsubscribed'     -- afgemeld
                        )),

  -- PlusVibe specifiek
  plusvibe_lead_id    TEXT,

  -- Timestamps
  added_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_sent_at       TIMESTAMPTZ,
  first_reply_at      TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,

  UNIQUE(contact_id, campaign_id)
);

-- Performance indexen
CREATE INDEX IF NOT EXISTS idx_contact_campaigns_contact ON contact_campaigns(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_campaigns_campaign ON contact_campaigns(campaign_id);
CREATE INDEX IF NOT EXISTS idx_contact_campaigns_client ON contact_campaigns(client_id);
CREATE INDEX IF NOT EXISTS idx_contact_campaigns_status ON contact_campaigns(campaign_status);
CREATE INDEX IF NOT EXISTS idx_contact_campaigns_plusvibe ON contact_campaigns(plusvibe_lead_id) WHERE plusvibe_lead_id IS NOT NULL;

-- Updated at trigger
DROP TRIGGER IF EXISTS contact_campaigns_updated_at ON contact_campaigns;
CREATE TRIGGER contact_campaigns_updated_at
  BEFORE UPDATE ON contact_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE contact_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency staff see all" ON contact_campaigns
  FOR SELECT USING (current_user_role() IN ('agency_admin', 'agency_staff'));

CREATE POLICY "client viewer sees own" ON contact_campaigns
  FOR SELECT USING (
    current_user_role() = 'client_viewer'
    AND client_id = current_user_client_id()
  );

CREATE POLICY "agency admin manage" ON contact_campaigns
  FOR ALL USING (current_user_role() = 'agency_admin');

CREATE POLICY "agency staff insert" ON contact_campaigns
  FOR INSERT WITH CHECK (current_user_role() IN ('agency_admin', 'agency_staff'));

COMMENT ON TABLE contact_campaigns IS 'Links contacts to campaigns with campaign-specific status tracking';

-- ============================================
-- Helper functies voor hergebruik logica
-- ============================================

-- Functie: update contact reuse availability
CREATE OR REPLACE FUNCTION update_contact_reuse_availability()
RETURNS TRIGGER AS $$
BEGIN
  -- Update contact.available_for_reuse_after based on status change
  IF NEW.contact_status IN ('qualified', 'no_show', 'unqualified', 'not_interested') THEN
    NEW.available_for_reuse_after := NOW() + (NEW.reuse_cooldown_days || ' days')::INTERVAL;
  ELSIF NEW.contact_status IN ('bounced', 'unsubscribed', 'do_not_contact') THEN
    NEW.available_for_reuse_after := NULL; -- nooit herbruiken
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_reuse ON contacts;
CREATE TRIGGER trigger_update_reuse
  BEFORE UPDATE OF contact_status ON contacts
  FOR EACH ROW
  WHEN (OLD.contact_status IS DISTINCT FROM NEW.contact_status)
  EXECUTE FUNCTION update_contact_reuse_availability();

-- Functie: check of contact herbruikbaar is
CREATE OR REPLACE FUNCTION is_contact_reusable(contact_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  is_valid BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM contacts
    WHERE id = contact_uuid
      AND contact_status IN ('new', 'qualified', 'no_show', 'unqualified', 'not_interested')
      AND times_targeted < 3
      AND (
        available_for_reuse_after IS NULL
        OR available_for_reuse_after <= NOW()
      )
  ) INTO is_valid;

  RETURN is_valid;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION is_contact_reusable IS 'Returns true if contact can be targeted in a new campaign';
