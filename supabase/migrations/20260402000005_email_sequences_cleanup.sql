-- ============================================
-- email_sequences: drop unused columns
-- These were added for an AI copy-evaluation system that was never built.
-- ============================================

ALTER TABLE email_sequences
  DROP COLUMN IF EXISTS offer_variant,
  DROP COLUMN IF EXISTS target_icp,
  DROP COLUMN IF EXISTS tone,
  DROP COLUMN IF EXISTS copy_status,
  DROP COLUMN IF EXISTS performance_score,
  DROP COLUMN IF EXISTS last_evaluated_at,
  DROP COLUMN IF EXISTS auto_paused,
  DROP COLUMN IF EXISTS pause_reason;
