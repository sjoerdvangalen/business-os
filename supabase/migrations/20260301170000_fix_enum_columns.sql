-- Fix crm_type and calendar_type: convert from enum to TEXT and drop NOT NULL
-- Needed because Airtable clients have various CRM/calendar values (Monday, Cal.com, Brevo, etc.)

ALTER TABLE clients ALTER COLUMN crm_type TYPE TEXT USING crm_type::TEXT;
ALTER TABLE clients ALTER COLUMN calendar_type TYPE TEXT USING calendar_type::TEXT;
ALTER TABLE clients ALTER COLUMN crm_type DROP NOT NULL;
ALTER TABLE clients ALTER COLUMN calendar_type DROP NOT NULL;

-- Also drop NOT NULL on domains.client_id (some domains may not have a client linked)
ALTER TABLE domains ALTER COLUMN client_id DROP NOT NULL;
