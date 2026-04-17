-- Sourcing infrastructure tables
-- sourcing_runs: tracking per data sourcing run
-- contact_validation_log: audit trail per contact validatie

CREATE TABLE sourcing_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  cell_id UUID REFERENCES campaign_cells(id) ON DELETE SET NULL,
  run_type TEXT NOT NULL
    CHECK (run_type IN ('company_sourcing','contact_sourcing','validation','enrichment','push')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed','cancelled')),
  input_params JSONB,
  businesses_found INT DEFAULT 0,
  businesses_new INT DEFAULT 0,
  contacts_found INT DEFAULT 0,
  contacts_new INT DEFAULT 0,
  contacts_valid INT DEFAULT 0,
  contacts_suppressed INT DEFAULT 0,
  contacts_pushed INT DEFAULT 0,
  api_credits_used JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sourcing_runs_client ON sourcing_runs(client_id);
CREATE INDEX idx_sourcing_runs_status ON sourcing_runs(status);

CREATE TABLE contact_validation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  sourcing_run_id UUID REFERENCES sourcing_runs(id) ON DELETE SET NULL,
  trykitt_result JSONB,
  enrow_result JSONB,
  omni_result JSONB,
  final_status TEXT CHECK (final_status IN ('valid','risky','invalid','unknown')),
  final_method TEXT CHECK (final_method IN ('trykitt','enrow','omni','fallback')),
  validated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cvl_contact ON contact_validation_log(contact_id);
CREATE INDEX idx_cvl_run ON contact_validation_log(sourcing_run_id);
