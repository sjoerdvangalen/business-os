-- ============================================================
-- Meeting review fields + status constraint
-- ============================================================

-- Review scheduling and tracking
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS review_scheduled_at TIMESTAMPTZ;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS review_slack_ts TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending';

-- Index for review cron query (meetings needing review)
CREATE INDEX IF NOT EXISTS idx_meetings_review_pending
  ON meetings(review_scheduled_at)
  WHERE reviewed_at IS NULL AND booking_status = 'booked';
