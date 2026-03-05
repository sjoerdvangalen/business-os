-- Remove unused columns from email_threads
-- Keep only essential data

-- Remove columns we don't need
ALTER TABLE email_threads DROP COLUMN IF EXISTS is_unread;
ALTER TABLE email_threads DROP COLUMN IF EXISTS body_html;
ALTER TABLE email_threads DROP COLUMN IF EXISTS content_preview;

-- Document what the ID fields do:
-- plusvibe_id: The unique email ID from PlusVibe (for deduplication)
-- thread_id: The conversation thread ID from PlusVibe (groups related emails)
-- last_email_id: The message ID needed for replying via PlusVibe API (reply_to_id)
