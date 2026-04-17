-- ============================================
-- LEAN EMAIL INBOXES REFACTOR
-- Consolidate external IDs + remove duplicates
-- ============================================

-- Step 1: Add new consolidated external ID column
ALTER TABLE email_inboxes
  ADD COLUMN IF NOT EXISTS provider_inbox_id TEXT;

-- Step 2: Migrate existing data from old columns to new column
UPDATE email_inboxes
  SET provider_inbox_id = plusvibe_id
  WHERE provider = 'plusvibe' AND plusvibe_id IS NOT NULL;

UPDATE email_inboxes
  SET provider_inbox_id = emailbison_id
  WHERE provider = 'emailbison' AND emailbison_id IS NOT NULL;

-- Step 3: Create new index for provider + external ID lookups
CREATE INDEX IF NOT EXISTS idx_email_inboxes_provider_inbox
  ON email_inboxes(provider, provider_inbox_id);

-- Step 4: Drop old indexes
DROP INDEX IF EXISTS idx_email_inboxes_plusvibe;
DROP INDEX IF EXISTS idx_email_inboxes_emailbison_id;

-- Step 5: Drop old external ID columns
ALTER TABLE email_inboxes
  DROP COLUMN IF EXISTS plusvibe_id,
  DROP COLUMN IF EXISTS emailbison_id;
