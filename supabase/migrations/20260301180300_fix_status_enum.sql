-- Drop views that depend on campaigns.status
DROP VIEW IF EXISTS v_campaign_performance;

-- Convert status from enum to TEXT
ALTER TABLE campaigns ALTER COLUMN status TYPE TEXT USING status::TEXT;

-- Recreate the view
CREATE OR REPLACE VIEW v_campaign_performance AS
SELECT
  ca.id,
  ca.name,
  cl.name as client,
  cl.client_code,
  ca.status,
  ca.total_leads,
  ca.emails_sent,
  ca.replies,
  ca.positive_replies,
  ca.reply_rate,
  ca.bounce_rate,
  ca.positive_rate,
  CASE
    WHEN ca.bounce_rate > 5 THEN 'CRITICAL'
    WHEN ca.bounce_rate > 3 THEN 'WARNING'
    WHEN ca.reply_rate < 1 AND ca.emails_sent > 100 THEN 'LOW_ENGAGEMENT'
    ELSE 'HEALTHY'
  END as health_status,
  ca.last_synced_at
FROM campaigns ca
LEFT JOIN clients cl ON cl.id = ca.client_id;
