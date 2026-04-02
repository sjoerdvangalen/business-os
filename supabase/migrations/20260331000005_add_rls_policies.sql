-- ============================================
-- UNIFIED DATA MODEL - Part 5: Add RLS Policies
-- Adds cross-table RLS policies (must run after all tables created)
-- ============================================

-- Client viewer policy for businesses (references contacts)
DROP POLICY IF EXISTS "client viewer sees own businesses" ON businesses;
CREATE POLICY "client viewer sees own businesses" ON businesses
  FOR SELECT USING (
    current_user_role() = 'client_viewer'
    AND EXISTS (
      SELECT 1 FROM contacts
      WHERE contacts.business_id = businesses.id
      AND contacts.client_id = current_user_client_id()
    )
  );

-- ============================================
-- Helper Views
-- ============================================

-- View: Contacts available for reuse
CREATE OR REPLACE VIEW contacts_available_for_reuse AS
SELECT
  c.*,
  b.name as business_name,
  b.domain as business_domain,
  b.industry as business_industry
FROM contacts c
JOIN businesses b ON c.business_id = b.id
WHERE c.contact_status IN ('new', 'qualified', 'no_show', 'unqualified', 'not_interested')
  AND c.times_targeted < 3
  AND (
    c.available_for_reuse_after IS NULL
    OR c.available_for_reuse_after <= NOW()
  );

COMMENT ON VIEW contacts_available_for_reuse IS 'Contacts that can be targeted in new campaigns';

-- View: Contact full details with business info
CREATE OR REPLACE VIEW contact_details AS
SELECT
  c.*,
  b.name as business_name,
  b.domain as business_domain,
  b.website as business_website,
  b.city as business_city,
  b.state as business_state,
  b.country as business_country,
  b.industry as business_industry,
  b.employee_count as business_employee_count,
  b.linkedin_url as business_linkedin_url,
  cl.name as client_name,
  cl.client_code as client_code
FROM contacts c
JOIN businesses b ON c.business_id = b.id
LEFT JOIN clients cl ON c.client_id = cl.id;

COMMENT ON VIEW contact_details IS 'Full contact details with business and client info';

-- View: Campaign contact summary
CREATE OR REPLACE VIEW campaign_contact_summary AS
SELECT
  cc.campaign_id,
  cc.client_id,
  COUNT(*) as total_contacts,
  COUNT(*) FILTER (WHERE cc.campaign_status = 'added') as pending,
  COUNT(*) FILTER (WHERE cc.campaign_status = 'sent') as sent,
  COUNT(*) FILTER (WHERE cc.campaign_status = 'replied') as replied,
  COUNT(*) FILTER (WHERE cc.campaign_status = 'meeting_booked') as meetings_booked,
  COUNT(*) FILTER (WHERE cc.campaign_status = 'completed') as completed,
  COUNT(*) FILTER (WHERE cc.campaign_status = 'bounced') as bounced
FROM contact_campaigns cc
GROUP BY cc.campaign_id, cc.client_id;

COMMENT ON VIEW campaign_contact_summary IS 'Summary stats per campaign';

-- ============================================
-- Helper Functions
-- ============================================

-- Function: Get contacts for campaign targeting
CREATE OR REPLACE FUNCTION get_contacts_for_campaign(
  p_client_id UUID,
  p_limit INT DEFAULT 100,
  p_exclude_campaign_id UUID DEFAULT NULL
)
RETURNS TABLE (
  contact_id UUID,
  business_id UUID,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  title TEXT,
  business_name TEXT,
  business_domain TEXT,
  business_industry TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id as contact_id,
    c.business_id,
    c.email,
    c.first_name,
    c.last_name,
    c.title,
    b.name as business_name,
    b.domain as business_domain,
    b.industry as business_industry
  FROM contacts c
  JOIN businesses b ON c.business_id = b.id
  WHERE c.contact_status IN ('new', 'qualified', 'no_show', 'unqualified', 'not_interested')
    AND c.times_targeted < 3
    AND (
      c.available_for_reuse_after IS NULL
      OR c.available_for_reuse_after <= NOW()
    )
    AND NOT EXISTS (
      SELECT 1 FROM contact_campaigns cc
      WHERE cc.contact_id = c.id
      AND cc.client_id = p_client_id
      AND (p_exclude_campaign_id IS NULL OR cc.campaign_id != p_exclude_campaign_id)
    )
  ORDER BY c.times_targeted ASC, c.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_contacts_for_campaign IS 'Returns contacts available for targeting in a campaign';
