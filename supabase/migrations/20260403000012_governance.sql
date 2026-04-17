-- ═══════════════════════════════════════════════════════════════════════════
-- Governance Migration
-- State machines, suppression model, classifier QA, immutable snapshots,
-- idempotency velden, A-Leads config versioning
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Scoped Suppression Model ─────────────────────────────────────────────

-- Stap 1: Tabel aanmaken zonder complexe constraints
CREATE TABLE IF NOT EXISTS blocked_entities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   TEXT NOT NULL,
  entity_value  TEXT NOT NULL,
  scope_type    TEXT NOT NULL,
  scope_ref     TEXT,
  reason        TEXT,
  blocked_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stap 2: Constraints apart toevoegen
ALTER TABLE blocked_entities
  DROP CONSTRAINT IF EXISTS blocked_entities_entity_type_check,
  DROP CONSTRAINT IF EXISTS blocked_entities_scope_type_check;

ALTER TABLE blocked_entities
  ADD CONSTRAINT blocked_entities_entity_type_check
    CHECK (entity_type IN ('company', 'domain', 'contact', 'persona')),
  ADD CONSTRAINT blocked_entities_scope_type_check
    CHECK (scope_type IN ('global', 'client', 'strategy', 'campaign_cell'));

-- Stap 3: Unieke index i.p.v. constraint voor COALESCE
DROP INDEX IF EXISTS idx_blocked_entities_unique;
CREATE UNIQUE INDEX idx_blocked_entities_unique
  ON blocked_entities (entity_type, entity_value, scope_type, COALESCE(scope_ref, ''));

ALTER TABLE blocked_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocked_entities_service_only" ON blocked_entities
  USING (auth.role() = 'service_role');

-- ── 2. email_inboxes: aparte status velden (vervangt eventueel gemixte enums) ─

-- Kolommen toevoegen zonder constraints
ALTER TABLE email_inboxes
  ADD COLUMN IF NOT EXISTS provisioning_status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS dns_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS warmup_status TEXT DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS sending_status TEXT DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS rotation_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS tenant_domain TEXT,
  ADD COLUMN IF NOT EXISTS provisioned_at TIMESTAMPTZ;

-- Bestaande data normaliseren naar geldige waarden
UPDATE email_inboxes SET warmup_status = 'not_started'
  WHERE warmup_status NOT IN ('not_started', 'warming', 'ready', 'degraded') OR warmup_status IS NULL;

UPDATE email_inboxes SET provisioning_status = 'active'
  WHERE provisioning_status NOT IN ('pending', 'active', 'failed') OR provisioning_status IS NULL;

UPDATE email_inboxes SET dns_status = 'pending'
  WHERE dns_status NOT IN ('pending', 'verified', 'failed') OR dns_status IS NULL;

UPDATE email_inboxes SET sending_status = 'inactive'
  WHERE sending_status NOT IN ('inactive', 'active', 'paused', 'retired') OR sending_status IS NULL;

UPDATE email_inboxes SET rotation_status = 'none'
  WHERE rotation_status NOT IN ('none', 'flagged', 'rotated') OR rotation_status IS NULL;

-- Constraints apart toevoegen
ALTER TABLE email_inboxes
  DROP CONSTRAINT IF EXISTS email_inboxes_provisioning_status_check,
  DROP CONSTRAINT IF EXISTS email_inboxes_dns_status_check,
  DROP CONSTRAINT IF EXISTS email_inboxes_warmup_status_check,
  DROP CONSTRAINT IF EXISTS email_inboxes_sending_status_check,
  DROP CONSTRAINT IF EXISTS email_inboxes_rotation_status_check;

ALTER TABLE email_inboxes
  ADD CONSTRAINT email_inboxes_provisioning_status_check
    CHECK (provisioning_status IN ('pending', 'active', 'failed')),
  ADD CONSTRAINT email_inboxes_dns_status_check
    CHECK (dns_status IN ('pending', 'verified', 'failed')),
  ADD CONSTRAINT email_inboxes_warmup_status_check
    CHECK (warmup_status IN ('not_started', 'warming', 'ready', 'degraded')),
  ADD CONSTRAINT email_inboxes_sending_status_check
    CHECK (sending_status IN ('inactive', 'active', 'paused', 'retired')),
  ADD CONSTRAINT email_inboxes_rotation_status_check
    CHECK (rotation_status IN ('none', 'flagged', 'rotated'));

-- ── 3. campaign_cells: immutable snapshot ──────────────────────────────────

ALTER TABLE campaign_cells
  ADD COLUMN IF NOT EXISTS snapshot JSONB;

-- Trigger: blokkeert mutatie van snapshot na aanmaken
CREATE OR REPLACE FUNCTION prevent_snapshot_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.snapshot IS NOT NULL AND NEW.snapshot IS DISTINCT FROM OLD.snapshot THEN
    RAISE EXCEPTION 'campaign_cells.snapshot is immutable after creation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS immutable_snapshot ON campaign_cells;
CREATE TRIGGER immutable_snapshot
  BEFORE UPDATE ON campaign_cells
  FOR EACH ROW EXECUTE FUNCTION prevent_snapshot_update();

-- ── 4. Reply Classifier QA velden ─────────────────────────────────────────

-- Kolommen toevoegen zonder constraints
ALTER TABLE email_threads
  ADD COLUMN IF NOT EXISTS classification_source TEXT DEFAULT 'ai',
  ADD COLUMN IF NOT EXISTS classification_confidence DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Bestaande data normaliseren
UPDATE email_threads SET classification_source = 'ai'
  WHERE classification_source NOT IN ('ai', 'human', 'rule') OR classification_source IS NULL;

UPDATE email_threads SET classification_confidence = NULL
  WHERE classification_confidence < 0 OR classification_confidence > 1;

-- Constraints apart toevoegen
ALTER TABLE email_threads
  DROP CONSTRAINT IF EXISTS email_threads_classification_source_check,
  DROP CONSTRAINT IF EXISTS email_threads_classification_confidence_check;

ALTER TABLE email_threads
  ADD CONSTRAINT email_threads_classification_source_check
    CHECK (classification_source IN ('ai', 'human', 'rule')),
  ADD CONSTRAINT email_threads_classification_confidence_check
    CHECK (classification_confidence BETWEEN 0 AND 1);

-- Auto-flag voor review: gebaseerd op classification_source = 'ai' met lage confidence
-- Trigger op email_threads: markeert voor review bij nieuwe AI classificatie
CREATE OR REPLACE FUNCTION auto_flag_review()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-flag als AI classificatie met lage confidence (< 0.7)
  IF NEW.classification_source = 'ai' AND NEW.classification_confidence IS NOT NULL
     AND NEW.classification_confidence < 0.7 THEN
    NEW.needs_review = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS flag_review_on_classify ON email_threads;
CREATE TRIGGER flag_review_on_classify
  BEFORE INSERT OR UPDATE ON email_threads
  FOR EACH ROW EXECUTE FUNCTION auto_flag_review();

-- ── 5. Idempotency velden op ingest-paden ─────────────────────────────────

-- sync_log tabel uitbreiden met externe event tracking
ALTER TABLE sync_log
  ADD COLUMN IF NOT EXISTS external_event_id TEXT,
  ADD COLUMN IF NOT EXISTS source_system TEXT;

-- Bestaande data normaliseren
UPDATE sync_log SET source_system = 'manual'
  WHERE source_system NOT IN ('plusvibe', 'emailbison', 'cal_com', 'ghl', 'aleads', 'manual') OR source_system IS NULL;

-- Constraint apart toevoegen
ALTER TABLE sync_log
  DROP CONSTRAINT IF EXISTS sync_log_source_system_check;

ALTER TABLE sync_log
  ADD CONSTRAINT sync_log_source_system_check
    CHECK (source_system IN ('plusvibe', 'emailbison', 'cal_com', 'ghl', 'aleads', 'manual'));

CREATE UNIQUE INDEX IF NOT EXISTS sync_log_idempotency
  ON sync_log (external_event_id, source_system)
  WHERE external_event_id IS NOT NULL;

-- ── 6. icp_segments: A-Leads config versioning ────────────────────────────

-- Tabel aanmaken als niet bestaat
CREATE TABLE IF NOT EXISTS icp_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  segment_code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  firmographic_criteria JSONB,
  trigger_events JSONB,
  hard_blocks JSONB,
  pain_mapping JSONB,
  aleads_config JSONB,
  aleads_config_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, segment_code)
);

-- Check constraint: vereiste keys in aleads_config
ALTER TABLE icp_segments
  DROP CONSTRAINT IF EXISTS aleads_config_required_keys;

ALTER TABLE icp_segments
  ADD CONSTRAINT aleads_config_required_keys CHECK (
    aleads_config IS NULL OR (
      aleads_config ? '$schema' AND
      aleads_config ? 'version' AND
      aleads_config ? 'include' AND
      (aleads_config->'include') ? 'geography' AND
      (aleads_config->'include') ? 'employee_range'
    )
  );

ALTER TABLE icp_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "icp_segments_service_only" ON icp_segments;
CREATE POLICY "icp_segments_service_only" ON icp_segments
  USING (auth.role() = 'service_role');

-- ── 7. gtm_strategies: state machine ──────────────────────────────────────

-- Tabel aanmaken als niet bestaat
CREATE TABLE IF NOT EXISTS gtm_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  strategy_code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  solutions JSONB,
  pain_mapping JSONB,
  icp_segments JSONB,
  buyer_personas JSONB,
  entry_offers JSONB,
  gate_status TEXT DEFAULT 'draft',
  gate_score INT,
  gate_feedback TEXT,
  gate_iterations INT NOT NULL DEFAULT 0,
  client_iterations INT NOT NULL DEFAULT 0,
  client_approved_at TIMESTAMPTZ,
  approver TEXT,
  force_approve BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, strategy_code)
);

-- Bestaande data normaliseren
UPDATE gtm_strategies SET gate_status = 'draft'
  WHERE gate_status NOT IN ('draft', 'synthesized', 'gate_review', 'gate_rejected', 'gate_approved', 'client_sent', 'client_iteration', 'client_approved')
     OR gate_status IS NULL;

UPDATE gtm_strategies SET gate_score = NULL
  WHERE gate_score < 0 OR gate_score > 100;

-- Constraints apart toevoegen
ALTER TABLE gtm_strategies
  DROP CONSTRAINT IF EXISTS gtm_strategies_gate_status_check,
  DROP CONSTRAINT IF EXISTS gtm_strategies_gate_score_check;

ALTER TABLE gtm_strategies
  ADD CONSTRAINT gtm_strategies_gate_status_check
    CHECK (gate_status IN (
      'draft', 'synthesized', 'gate_review', 'gate_rejected',
      'gate_approved', 'client_sent', 'client_iteration', 'client_approved'
    )),
  ADD CONSTRAINT gtm_strategies_gate_score_check
    CHECK (gate_score BETWEEN 0 AND 100);

ALTER TABLE gtm_strategies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gtm_strategies_service_only" ON gtm_strategies;
CREATE POLICY "gtm_strategies_service_only" ON gtm_strategies
  USING (auth.role() = 'service_role');

-- ── 8. campaign_cells: state machine en human overrides ───────────────────

-- Alleen kolommen toevoegen die niet al bestaan in 20260402000002_gtm_schema.sql
DO $$
BEGIN
  -- Check of run_phase al bestaat (nieuwere versie van schema)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_cells' AND column_name = 'run_phase'
  ) THEN
    ALTER TABLE campaign_cells ADD COLUMN run_phase TEXT DEFAULT 'pilot_copy';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_cells' AND column_name = 'force_pause'
  ) THEN
    ALTER TABLE campaign_cells ADD COLUMN force_pause BOOLEAN NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_cells' AND column_name = 'force_approve'
  ) THEN
    ALTER TABLE campaign_cells ADD COLUMN force_approve BOOLEAN NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_cells' AND column_name = 'override_reason'
  ) THEN
    ALTER TABLE campaign_cells ADD COLUMN override_reason TEXT;
  END IF;
END $$;

-- Bestaande data normaliseren (alleen als kolom bestaat)
UPDATE campaign_cells SET run_phase = 'pilot_copy'
  WHERE run_phase NOT IN ('pilot_copy', 'H1_testing', 'H1_winner', 'F1_testing', 'F1_winner', 'CTA1_testing', 'soft_launch', 'scaling', 'killed')
     OR run_phase IS NULL;

-- Constraint apart toevoegen
ALTER TABLE campaign_cells
  DROP CONSTRAINT IF EXISTS campaign_cells_run_phase_check;

ALTER TABLE campaign_cells
  ADD CONSTRAINT campaign_cells_run_phase_check
    CHECK (run_phase IN (
      'pilot_copy', 'H1_testing', 'H1_winner', 'F1_testing', 'F1_winner',
      'CTA1_testing', 'soft_launch', 'scaling', 'killed'
    ));

-- ── 9. Indexes ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_blocked_entities_scope
  ON blocked_entities (entity_type, scope_type, scope_ref);

CREATE INDEX IF NOT EXISTS idx_email_threads_needs_review
  ON email_threads (needs_review) WHERE needs_review = true;

CREATE INDEX IF NOT EXISTS idx_gtm_strategies_gate_status
  ON gtm_strategies (gate_status);

CREATE INDEX IF NOT EXISTS idx_campaign_cells_run_phase
  ON campaign_cells (run_phase);
