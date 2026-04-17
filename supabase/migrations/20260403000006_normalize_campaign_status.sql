-- ============================================
-- NORMALIZE CAMPAIGN STATUS VALUES
-- Standardize to lowercase for consistency
-- ============================================

-- Step 1: Normalize all status values to lowercase
UPDATE campaigns
  SET status = LOWER(status)
  WHERE status IS NOT NULL;

-- Step 2: Fix common typos
UPDATE campaigns
  SET status = 'completed'
  WHERE status = 'completea';  -- typo fix

-- Step 3: Add CHECK constraint to enforce valid statuses
-- First drop if exists
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;

-- Add CHECK constraint for valid statuses
-- Standard statuses across PlusVibe and EmailBison
ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_status_check
  CHECK (status IN (
    'active',       -- Running
    'paused',       -- Temporarily stopped
    'completed',    -- Finished successfully
    'archived',     -- Old/deprecated
    'draft',        -- Not started
    'stopped'       -- Manually stopped
  ));

-- Step 4: Create index for status lookups
CREATE INDEX IF NOT EXISTS idx_campaigns_status_lower
  ON campaigns(status);
