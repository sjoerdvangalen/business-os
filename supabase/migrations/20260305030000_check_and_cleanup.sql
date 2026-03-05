-- Check and cleanup: remove any remaining views and verify schema

-- Drop views if they exist
DROP VIEW IF EXISTS v_email_threads_complete CASCADE;
DROP VIEW IF EXISTS v_webhook_activity CASCADE;

-- Verify email_threads columns
COMMENT ON TABLE email_threads IS 'Email conversations - stores both inbound and outbound emails';
