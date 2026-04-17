-- ============================================
-- LINK EMAIL_INBOXES TO DOMAINS
-- Adds domain_id FK and backfills existing data
-- ============================================

-- Step 1: Add domain_id column to email_inboxes if not exists
ALTER TABLE email_inboxes
  ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES domains(id);

-- Step 2: Create index for domain_id lookups
CREATE INDEX IF NOT EXISTS idx_email_inboxes_domain_id
  ON email_inboxes(domain_id)
  WHERE domain_id IS NOT NULL;

-- Step 3: Backfill domain_id for existing inboxes
-- This links each inbox to its domain based on email address
UPDATE email_inboxes ei
SET domain_id = d.id
FROM domains d
WHERE SPLIT_PART(ei.email, '@', 2) = d.domain
  AND ei.domain_id IS NULL;

-- Step 4: Log how many were linked
-- (Run manually to verify: SELECT COUNT(*) FROM email_inboxes WHERE domain_id IS NOT NULL)
