-- ============================================
-- LEAN CAMPAIGNS REFACTOR
-- Consolidate external IDs + remove unused columns
-- ============================================

-- Step 1: Add new consolidated external ID column
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS provider_campaign_id TEXT;

-- Step 2: Migrate existing data from old columns to new column
UPDATE campaigns
  SET provider_campaign_id = plusvibe_id
  WHERE provider = 'plusvibe' AND plusvibe_id IS NOT NULL;

UPDATE campaigns
  SET provider_campaign_id = emailbison_id
  WHERE provider = 'emailbison' AND emailbison_id IS NOT NULL;

-- Step 3: Create new index for provider + external ID lookups
CREATE INDEX IF NOT EXISTS idx_campaigns_provider_campaign
  ON campaigns(provider, provider_campaign_id);

-- Step 4: Drop old indexes
DROP INDEX IF EXISTS idx_campaigns_plusvibe;
DROP INDEX IF EXISTS idx_campaigns_emailbison_id;

-- Step 5: Drop old external ID columns
ALTER TABLE campaigns
  DROP COLUMN IF EXISTS plusvibe_id,
  DROP COLUMN IF EXISTS emailbison_id;

-- Step 6: Drop unused columns
ALTER TABLE campaigns
  DROP COLUMN IF EXISTS channel,
  DROP COLUMN IF EXISTS campaign_type,
  DROP COLUMN IF EXISTS unique_opens,
  DROP COLUMN IF EXISTS neutral_replies,
  DROP COLUMN IF EXISTS negative_replies,
  DROP COLUMN IF EXISTS open_rate,
  DROP COLUMN IF EXISTS unsubscribes;

-- Step 7: Make status global (remove CHECK constraint)
-- First find and drop the constraint
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO constraint_name
  FROM information_schema.table_constraints tc
  WHERE tc.table_name = 'campaigns'
    AND tc.constraint_type = 'CHECK'
    AND tc.constraint_name LIKE '%status%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE campaigns DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

-- Step 8: Clean up any orphaned indexes
DROP INDEX IF EXISTS idx_campaigns_status;
