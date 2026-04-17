-- ============================================
-- CAMPAIGNS CLEANUP
-- 1. Migrate external_campaign_id to provider_campaign_id
-- 2. Handle Q-suffixed external IDs
-- 3. Add UNIQUE constraint
-- 4. Remove unused columns
-- ============================================

-- Step 1: Migrate external_campaign_id to provider_campaign_id
-- This handles any legacy data that wasn't migrated in previous refactor
UPDATE campaigns
  SET provider_campaign_id = external_campaign_id
  WHERE external_campaign_id IS NOT NULL
    AND provider_campaign_id IS NULL;

-- Step 2: Migrate Q-suffixed external IDs (format: 123Q)
-- These are EmailBison legacy IDs that should be in provider_campaign_id
UPDATE campaigns
  SET provider_campaign_id = external_campaign_id,
      provider = 'emailbison'
  WHERE external_campaign_id ~ '^[0-9]{3}Q$'
    AND provider_campaign_id IS NULL;

-- Step 3: Remove duplicate campaigns (same provider + provider_campaign_id)
-- Keep the one with the most emails_sent (most active)
WITH duplicates AS (
  SELECT id,
         provider,
         provider_campaign_id,
         emails_sent,
         ROW_NUMBER() OVER (
           PARTITION BY provider, provider_campaign_id
           ORDER BY emails_sent DESC, created_at DESC
         ) as rn
  FROM campaigns
  WHERE provider_campaign_id IS NOT NULL
)
DELETE FROM campaigns
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Step 4: Add partial UNIQUE constraint on provider + provider_campaign_id
-- Only applies where provider_campaign_id is not NULL
-- This allows NULL values (for legacy records) but enforces uniqueness for synced records
DROP INDEX IF EXISTS idx_campaigns_provider_campaign_unique;
CREATE UNIQUE INDEX idx_campaigns_provider_campaign_unique
  ON campaigns(provider, provider_campaign_id)
  WHERE provider_campaign_id IS NOT NULL;

-- Step 5: Remove unused columns
ALTER TABLE campaigns
  DROP COLUMN IF EXISTS opportunity_value,
  DROP COLUMN IF EXISTS last_lead_sent,
  DROP COLUMN IF EXISTS last_lead_replied,
  DROP COLUMN IF EXISTS external_campaign_id;

-- Step 6: Drop strategy_id if it exists (check first)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'strategy_id'
  ) THEN
    ALTER TABLE campaigns DROP COLUMN strategy_id;
  END IF;
END $$;

-- Step 7: Clean up any orphaned indexes
DROP INDEX IF EXISTS idx_campaigns_opportunity_value;
DROP INDEX IF EXISTS idx_campaigns_strategy_id;

-- Step 8: Add comment explaining the duplicate handling logic
COMMENT ON TABLE campaigns IS 'Campaigns from PlusVibe and EmailBison.
Duplicates allowed: same name, different provider_campaign_id.
NOT allowed: same name + same provider_campaign_id (enforced by idx_campaigns_provider_campaign_unique).';
