-- ============================================
-- CAMPAIGNS LEANER — Remove more unused columns
-- ============================================

-- Remove fields that are not needed for core functionality
ALTER TABLE campaigns
  DROP COLUMN IF EXISTS send_priority,
  DROP COLUMN IF EXISTS stop_on_reply,
  DROP COLUMN IF EXISTS start_date,
  DROP COLUMN IF EXISTS end_date,
  DROP COLUMN IF EXISTS last_synced_at;  -- updated_at does the same job

-- Clean up any orphaned indexes
DROP INDEX IF EXISTS idx_campaigns_send_priority;
DROP INDEX IF EXISTS idx_campaigns_stop_on_reply;
DROP INDEX IF EXISTS idx_campaigns_start_date;
DROP INDEX IF EXISTS idx_campaigns_end_date;
DROP INDEX IF EXISTS idx_campaigns_last_synced_at;
