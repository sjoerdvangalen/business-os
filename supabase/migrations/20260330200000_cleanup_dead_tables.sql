-- Cleanup dead tables and columns
-- Drops unused tables and columns from PlusVibe sync

-- Drop dead tables (0 rows)
DROP TABLE IF EXISTS scraping_csv_exports CASCADE;
DROP TABLE IF EXISTS daily_snapshots CASCADE;
DROP TABLE IF EXISTS lead_pool CASCADE;
DROP TABLE IF EXISTS campaign_metrics CASCADE;

-- Drop dead columns from campaigns
ALTER TABLE campaigns
  DROP COLUMN IF EXISTS is_acc_based_sending,
  DROP COLUMN IF EXISTS is_emailopened_tracking,
  DROP COLUMN IF EXISTS is_esp_match,
  DROP COLUMN IF EXISTS is_pause_on_bouncerate,
  DROP COLUMN IF EXISTS is_unsubscribed_link,
  DROP COLUMN IF EXISTS send_as_txt,
  DROP COLUMN IF EXISTS exclude_ooo,
  DROP COLUMN IF EXISTS other_email_acc;

-- Add comment
COMMENT ON TABLE campaigns IS 'Synced from PlusVibe - cleaned up dead columns 2025-03-30';
