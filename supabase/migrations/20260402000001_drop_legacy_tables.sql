-- ============================================
-- Drop legacy tables: leads, companies, email_cache, webhook_logs, agent_memory
--
-- Context:
--   leads     → gemigreerd naar contacts via 20260331000004
--   companies → gemigreerd naar businesses via 20260331000004
--   email_cache → vervangen door contacts.email_verified + email_verified_at
--   webhook_logs → geen actieve reads, debug-only
--   agent_memory → vervangen door alerts (zie 20260329000001)
-- ============================================

-- Safety check: abort als er un-migrated leads of companies zijn
DO $$
DECLARE
  unmigrated_leads INT;
  unmigrated_companies INT;
BEGIN
  SELECT COUNT(*) INTO unmigrated_leads
  FROM leads l
  WHERE l.email IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM contacts c WHERE c.email = l.email
    );

  SELECT COUNT(*) INTO unmigrated_companies
  FROM companies co
  WHERE co.domain IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM businesses b WHERE b.domain = co.domain
    );

  IF unmigrated_leads > 0 THEN
    RAISE EXCEPTION 'Safety check failed: % leads niet gemigreerd naar contacts', unmigrated_leads;
  END IF;

  IF unmigrated_companies > 0 THEN
    RAISE EXCEPTION 'Safety check failed: % companies niet gemigreerd naar businesses', unmigrated_companies;
  END IF;

  RAISE NOTICE 'Safety checks passed (leads: 0 unmigrated, companies: 0 unmigrated). Proceeding.';
END $$;

-- Drop legacy tables
DROP TABLE IF EXISTS leads CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TABLE IF EXISTS email_cache CASCADE;
DROP TABLE IF EXISTS webhook_logs CASCADE;
DROP TABLE IF EXISTS agent_memory CASCADE;
