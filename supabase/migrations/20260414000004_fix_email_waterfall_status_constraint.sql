-- Fix contacts.email_waterfall_status CHECK constraint
-- Code uses: pending, verified, cache_hit, failed, existing, skipped, invalidated, dnc_domain, catch_all, unknown, invalid

ALTER TABLE contacts
  DROP CONSTRAINT IF EXISTS contacts_email_waterfall_status_check;

ALTER TABLE contacts
  ADD CONSTRAINT contacts_email_waterfall_status_check
  CHECK (email_waterfall_status IN (
    'pending', 'verified', 'cache_hit', 'failed', 'existing', 'skipped',
    'invalidated', 'dnc_domain', 'catch_all', 'unknown', 'invalid'
  ));
