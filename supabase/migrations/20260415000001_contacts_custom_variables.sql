-- Add custom_variables JSONB to contacts
-- Stores campaign/domain-specific template variables (e.g. aantal, kWp, locaties, min, max).
-- Separate from enrichment_data (AI/external enrichment) — explicit and queryable.
-- Values are passed through to EmailBison as custom lead variables.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS custom_variables JSONB DEFAULT '{}';

COMMENT ON COLUMN contacts.custom_variables IS
  'Campaign/domain-specific template variables (e.g. aantal, kWp, locaties, min, max).
   Flat key-value pairs. Separate from enrichment_data (AI/external enrichment).
   Values are passed through to EmailBison as custom lead variables.';
