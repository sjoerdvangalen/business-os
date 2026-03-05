-- Compact email_threads schema for efficient lookups
-- Only store essential data, rest via foreign key lookups

-- ============================================
-- ADD ESSENTIAL FIELDS for PlusVibe integration
-- ============================================

-- Link to email_inbox (for reply functionality)
ALTER TABLE email_threads 
  ADD COLUMN IF NOT EXISTS email_inbox_id UUID REFERENCES email_inboxes(id);

-- PlusVibe last_email_id (needed for reply_to_id when sending reply)
ALTER TABLE email_threads 
  ADD COLUMN IF NOT EXISTS last_email_id TEXT;

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_email_threads_inbox 
  ON email_threads(email_inbox_id);

CREATE INDEX IF NOT EXISTS idx_email_threads_last_email 
  ON email_threads(last_email_id) 
  WHERE last_email_id IS NOT NULL;

-- ============================================
-- VIEW: Complete email with all lookups
-- Use this in UI instead of direct table query
-- ============================================
CREATE OR REPLACE VIEW v_email_threads_complete AS
SELECT 
  et.id,
  et.plusvibe_id,
  et.thread_id,
  et.last_email_id,
  et.direction,
  et.subject,
  et.body_text,
  et.body_html,
  et.content_preview,
  et.is_unread,
  et.label,
  et.sent_at,
  et.created_at,
  
  -- Contact lookup
  et.contact_id,
  c.email as contact_email,
  c.first_name as contact_first_name,
  c.last_name as contact_last_name,
  c.full_name as contact_full_name,
  c.company as contact_company,
  c.lead_status as contact_status,
  
  -- Campaign lookup
  et.campaign_id,
  camp.name as campaign_name,
  camp.plusvibe_id as campaign_plusvibe_id,
  cl.id as client_id,
  cl.client_code,
  cl.name as client_name,
  
  -- Email inbox lookup (for sending replies)
  et.email_inbox_id,
  ei.email as inbox_email,
  ei.plusvibe_id as inbox_plusvibe_id,
  
  -- Sender/recipient (stored for quick display)
  et.from_email,
  et.to_email

FROM email_threads et
LEFT JOIN contacts c ON c.id = et.contact_id
LEFT JOIN campaigns camp ON camp.id = et.campaign_id
LEFT JOIN clients cl ON cl.id = camp.client_id
LEFT JOIN email_inboxes ei ON ei.id = et.email_inbox_id;

-- ============================================
-- FUNCTION: Get reply data for PlusVibe API
-- ============================================
CREATE OR REPLACE FUNCTION get_email_reply_data(p_email_thread_id UUID)
RETURNS TABLE (
  last_email_id TEXT,
  inbox_plusvibe_id TEXT,
  to_email TEXT,
  from_email TEXT,
  campaign_plusvibe_id TEXT,
  contact_email TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    et.last_email_id,
    ei.plusvibe_id as inbox_plusvibe_id,
    et.from_email as to_email,  -- Reply goes back to sender
    ei.email as from_email,      -- Send from inbox email
    camp.plusvibe_id as campaign_plusvibe_id,
    c.email as contact_email
  FROM email_threads et
  LEFT JOIN email_inboxes ei ON ei.id = et.email_inbox_id
  LEFT JOIN campaigns camp ON camp.id = et.campaign_id
  LEFT JOIN contacts c ON c.id = et.contact_id
  WHERE et.id = p_email_thread_id;
END;
$$ LANGUAGE plpgsql;
