-- Compact email_threads schema - alleen essentiële kolommen toevoegen
-- GEEN views, GEEN functies - direct in tabel werken

-- ============================================
-- ESSENTIAL FIELDS voor PlusVibe integration
-- ============================================

-- Link naar email_inbox (voor reply functionality)
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
-- DROP VIEWS/FUNCTIONS if they exist from previous attempt
-- ============================================
DROP VIEW IF EXISTS v_email_threads_complete CASCADE;
DROP FUNCTION IF EXISTS get_email_reply_data(UUID) CASCADE;
