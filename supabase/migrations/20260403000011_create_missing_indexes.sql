-- ============================================
-- CREATE MISSING INDEXES (Verified Deployment)
-- These indexes were in migration 08 but never actually created
-- Only create for tables that exist
-- ============================================

-- campaigns: frequent lookups by client_id
CREATE INDEX IF NOT EXISTS idx_campaigns_client_id
  ON campaigns(client_id);

-- email_threads: lookups by provider + provider_lead_id (for EmailBison/PlusVibe webhooks)
CREATE INDEX IF NOT EXISTS idx_email_threads_provider_lead
  ON email_threads(provider, provider_lead_id)
  WHERE provider IS NOT NULL AND provider_lead_id IS NOT NULL;

-- contacts: email verification status lookups
CREATE INDEX IF NOT EXISTS idx_contacts_email_verified
  ON contacts(email_verified)
  WHERE email_verified IS NOT NULL;

-- email_inboxes: domain lookups for sync-domains
CREATE INDEX IF NOT EXISTS idx_email_inboxes_email
  ON email_inboxes(email);

-- email_inboxes: domain_id FK lookups
CREATE INDEX IF NOT EXISTS idx_email_inboxes_domain_id
  ON email_inboxes(domain_id)
  WHERE domain_id IS NOT NULL;

-- NOTE: contact_campaigns table does not exist - indexes skipped:
--   idx_contact_campaigns_campaign ON contact_campaigns(campaign_id, contact_id)
--   idx_contact_campaigns_contact ON contact_campaigns(contact_id)
