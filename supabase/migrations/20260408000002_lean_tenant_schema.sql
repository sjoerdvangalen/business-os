-- v2 lean schema: consolideer 3 overbodige tabellen uit migratie 000001
-- domain_orders → domains tabel (extra kolommen)
-- tenant_run_steps → tenant_provisioning_runs.steps JSONB
-- domain_dns_events → domains.dns_events JSONB
-- clients: drop 6 kolommen die nergens in runtime code voorkomen

-- 1. Drop overbodige tabellen
DROP TABLE IF EXISTS domain_dns_events CASCADE;
DROP TABLE IF EXISTS tenant_run_steps  CASCADE;
DROP TABLE IF EXISTS domain_orders     CASCADE;
DROP TYPE  IF EXISTS domain_order_status;

-- 2. Extend domains: Namecheap purchase data + DNS events audit
ALTER TABLE domains
  ADD COLUMN IF NOT EXISTS purchase_status    TEXT CHECK (purchase_status IN (
    'requested','purchasing','purchased','ns_pending','ns_set','active','failed'
  )),
  ADD COLUMN IF NOT EXISTS namecheap_order_id TEXT,
  ADD COLUMN IF NOT EXISTS nameservers        TEXT[],
  ADD COLUMN IF NOT EXISTS purchased_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ns_set_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS purchase_error     TEXT,
  ADD COLUMN IF NOT EXISTS years              INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS dns_events         JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS domains_purchase_status_idx ON domains(purchase_status);

-- 3. Extend tenant_provisioning_runs: stap-detail als JSONB array
ALTER TABLE tenant_provisioning_runs
  ADD COLUMN IF NOT EXISTS steps JSONB NOT NULL DEFAULT '[]';

-- 4. Clients opruimen: kolommen die nergens in runtime code voorkomen
-- (calendar_last_webhook blijft — gebruikt in webhook-meeting/index.ts)
ALTER TABLE clients
  DROP COLUMN IF EXISTS airtable_id,
  DROP COLUMN IF EXISTS total_cash_collected,
  DROP COLUMN IF EXISTS demo_link,
  DROP COLUMN IF EXISTS discovery_link,
  DROP COLUMN IF EXISTS onboarding_started_at,
  DROP COLUMN IF EXISTS onboarding_completed_at;
