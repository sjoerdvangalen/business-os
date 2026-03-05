-- Cleanup email_threads: remove unused columns, keep only essentials
-- Label is BEHOUDEN - komt door in PlusVibe webhooks

-- ============================================
-- REMOVE UNUSED COLUMNS
-- ============================================

-- These columns are not populated by the webhook and are deprecated
ALTER TABLE email_threads DROP COLUMN IF EXISTS email_type;
ALTER TABLE email_threads DROP COLUMN IF EXISTS webhook_event;
ALTER TABLE email_threads DROP COLUMN IF EXISTS webhook_received_at;

-- ============================================
-- VERIFY FINAL SCHEMA
-- ============================================

-- Remaining columns should be:
-- - id (UUID, primary key, auto)
-- - plusvibe_id (TEXT) - PlusVibe email ID
-- - thread_id (TEXT) - conversation thread
-- - last_email_id (TEXT) - for reply functionality
-- - contact_id (UUID, FK) - link to contacts
-- - campaign_id (UUID, FK) - link to campaigns
-- - email_inbox_id (UUID, FK) - link to email_inboxes
-- - direction (TEXT) - inbound/outbound
-- - from_email (TEXT) - sender
-- - to_email (TEXT) - recipient
-- - subject (TEXT) - email subject
-- - body_text (TEXT) - plain text body
-- - body_html (TEXT) - HTML body
-- - content_preview (TEXT) - first 200 chars
-- - label (TEXT) - PlusVibe label (INTERESTED, etc.)
-- - is_unread (BOOLEAN) - read status
-- - sent_at (TIMESTAMPTZ) - email timestamp
-- - created_at (TIMESTAMPTZ) - auto timestamp
