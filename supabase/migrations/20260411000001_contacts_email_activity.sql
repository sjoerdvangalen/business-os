-- Add email activity tracking to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_activity JSONB NOT NULL DEFAULT '{}';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_response_time_hours INT;

-- Add is_manual flag to email_threads
ALTER TABLE email_threads ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT FALSE;
