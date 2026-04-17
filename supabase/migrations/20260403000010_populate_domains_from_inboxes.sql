-- ============================================
-- POPULATE DOMAINS FROM EXISTING INBOXES
-- One-time migration to extract unique domains from all email_inboxes
-- ============================================

-- Step 1: Insert unique domains from email_inboxes
INSERT INTO domains (
  domain,
  client_id,
  provider,
  spf_status,
  dkim_status,
  dmarc_status,
  health_status,
  created_at,
  updated_at
)
SELECT DISTINCT
  SPLIT_PART(email, '@', 2) as domain,
  client_id,
  provider,
  'unknown' as spf_status,
  'unknown' as dkim_status,
  'unknown' as dmarc_status,
  'UNKNOWN' as health_status,
  NOW() as created_at,
  NOW() as updated_at
FROM email_inboxes
WHERE email IS NOT NULL
  AND SPLIT_PART(email, '@', 2) NOT IN (
    SELECT domain FROM domains WHERE domain IS NOT NULL
  )
ON CONFLICT (domain) DO NOTHING;

-- Step 2: Log count
-- SELECT COUNT(*) as new_domains FROM domains WHERE created_at > NOW() - INTERVAL '1 minute';
