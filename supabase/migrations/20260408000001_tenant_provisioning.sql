-- ═══════════════════════════════════════════════════════════════════════════
-- Tenant Provisioning Schema
-- Logt M365 tenant runs, per-stap events, Namecheap domain orders, DNS events
-- en EmailBison upload runs. Tenants/ orchestrator schrijft hierheen i.p.v.
-- eigen losse Supabase.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Provisioning runs ─────────────────────────────────────────────────────
-- 1 rij per orchestrator-call per tenant (domain)

CREATE TABLE tenant_provisioning_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID REFERENCES clients(id) ON DELETE SET NULL,
  domain           TEXT NOT NULL,
  tenant_id_ms     TEXT,
  app_id           TEXT,
  cert_thumbprint  TEXT,
  status           TEXT NOT NULL CHECK (status IN (
    'pending','bootstrapping','domain_setup','mailboxes',
    'dns','dkim','done','error'
  )),
  mailbox_count    INT DEFAULT 0,
  error_message    TEXT,
  triggered_by     TEXT,           -- 'cli' | 'dashboard' | 'cron'
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ,
  duration_seconds INT GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (completed_at - started_at))::INT
  ) STORED
);

CREATE INDEX ON tenant_provisioning_runs(client_id);
CREATE INDEX ON tenant_provisioning_runs(domain);
CREATE INDEX ON tenant_provisioning_runs(status);
CREATE INDEX ON tenant_provisioning_runs(started_at DESC);

-- ── 2. Per-stap detail ────────────────────────────────────────────────────────

CREATE TABLE tenant_run_steps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID NOT NULL REFERENCES tenant_provisioning_runs(id) ON DELETE CASCADE,
  step          TEXT NOT NULL,    -- bootstrap|domain_setup|mailboxes|dns|dkim
  status        TEXT NOT NULL,    -- started|success|error|skipped
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  stdout_tail   TEXT,
  error         TEXT
);

CREATE INDEX ON tenant_run_steps(run_id);

-- ── 3. Domain orders (Namecheap) ─────────────────────────────────────────────

CREATE TYPE domain_order_status AS ENUM (
  'requested','purchasing','purchased','ns_pending',
  'ns_set','active','failed'
);

CREATE TABLE domain_orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID REFERENCES clients(id) ON DELETE SET NULL,
  domain              TEXT NOT NULL UNIQUE,
  registrar           TEXT NOT NULL DEFAULT 'namecheap',
  order_status        domain_order_status NOT NULL DEFAULT 'requested',
  namecheap_order_id  TEXT,
  price_usd           NUMERIC(10,2),
  years               INT DEFAULT 1,
  nameservers         TEXT[],      -- ['ns1.cloudflare.com','ns2.cloudflare.com']
  requested_by        TEXT,
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  purchased_at        TIMESTAMPTZ,
  ns_set_at           TIMESTAMPTZ,
  error_message       TEXT
);

CREATE INDEX ON domain_orders(client_id);
CREATE INDEX ON domain_orders(order_status);
CREATE INDEX ON domain_orders(domain);

-- ── 4. DNS events audit ───────────────────────────────────────────────────────
-- Alle DNS records geplaatst via Cloudflare/Namecheap/M365

CREATE TABLE domain_dns_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_order_id UUID REFERENCES domain_orders(id) ON DELETE CASCADE,
  run_id          UUID REFERENCES tenant_provisioning_runs(id) ON DELETE SET NULL,
  domain          TEXT NOT NULL,
  record_type     TEXT NOT NULL,   -- SPF|DKIM|DMARC|MX|TXT|CNAME
  record_name     TEXT,
  record_value    TEXT,
  action          TEXT NOT NULL,   -- create|update|delete|verify
  source          TEXT NOT NULL,   -- 'cloudflare'|'namecheap'|'m365'
  status          TEXT NOT NULL,   -- success|error
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON domain_dns_events(domain);
CREATE INDEX ON domain_dns_events(domain_order_id);
CREATE INDEX ON domain_dns_events(run_id);

-- ── 5. Uploader runs ──────────────────────────────────────────────────────────
-- EmailBison (en toekomstige uploaders)

CREATE TABLE uploader_runs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            UUID REFERENCES clients(id) ON DELETE SET NULL,
  provisioning_run_id  UUID REFERENCES tenant_provisioning_runs(id) ON DELETE SET NULL,
  uploader             TEXT NOT NULL,   -- 'emailbison'|'instantly'|'plusvibe'
  workspace_id         TEXT,
  account_count        INT,
  success_count        INT,
  failure_count        INT,
  tag                  TEXT,
  status               TEXT NOT NULL,   -- running|success|partial|failed
  csv_path             TEXT,
  failures_csv_path    TEXT,
  started_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at         TIMESTAMPTZ,
  error                TEXT
);

CREATE INDEX ON uploader_runs(client_id);
CREATE INDEX ON uploader_runs(provisioning_run_id);
CREATE INDEX ON uploader_runs(status);

-- ── 6. email_inboxes koppelen aan provisioning runs ───────────────────────────

ALTER TABLE email_inboxes
  ADD COLUMN IF NOT EXISTS provisioning_run_id UUID
    REFERENCES tenant_provisioning_runs(id) ON DELETE SET NULL;

CREATE INDEX ON email_inboxes(provisioning_run_id);

-- ── 7. RLS ───────────────────────────────────────────────────────────────────
-- Service_role now — per-client RLS policies komen bij client portal (later)

ALTER TABLE tenant_provisioning_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_run_steps         ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_orders            ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_dns_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploader_runs            ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON tenant_provisioning_runs
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON tenant_run_steps
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON domain_orders
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON domain_dns_events
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON uploader_runs
  USING (auth.role() = 'service_role');

-- Toekomstige client portal policies (NIET activeren nu):
-- CREATE POLICY "client_own_runs" ON tenant_provisioning_runs
--   FOR SELECT USING (
--     client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid())
--   );
