-- ============================================
-- Ensure accounts table has columns needed by webhook-receiver
-- These may already exist from Airtable import, IF NOT EXISTS handles that
-- ============================================

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS domain TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Index for fast domain lookups (used in webhook-receiver for account matching)
CREATE INDEX IF NOT EXISTS idx_accounts_domain ON accounts(domain);
CREATE INDEX IF NOT EXISTS idx_accounts_client ON accounts(client_id);
CREATE INDEX IF NOT EXISTS idx_accounts_name ON accounts(name);

-- Ensure contacts.account_id FK exists
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id);
CREATE INDEX IF NOT EXISTS idx_contacts_account ON contacts(account_id);
