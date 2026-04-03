-- ═══════════════════════════════════════════════════════════════════════════
-- GTM Strategy & Campaign Cell Schema
-- Scheiding: strategy = denklaag, cell = execution unit
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. gtm_strategies tabel ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gtm_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,

  -- JSONB containers (geen losse tabellen)
  solutions_json JSONB NOT NULL DEFAULT '[]',
  pains_json JSONB NOT NULL DEFAULT '[]',
  icp_segments_json JSONB NOT NULL DEFAULT '[]',
  buyer_personas_json JSONB NOT NULL DEFAULT '[]',
  entry_offers_json JSONB NOT NULL DEFAULT '[]',
  proof_assets_json JSONB NOT NULL DEFAULT '[]',
  messaging_direction_json JSONB NOT NULL DEFAULT '[]',
  research_context_json JSONB NOT NULL DEFAULT '{}',
  onboarding_context_json JSONB NOT NULL DEFAULT '{}',

  -- Status & gate
  status TEXT NOT NULL DEFAULT 'draft',
  gate_score INTEGER,
  gate_feedback TEXT,
  client_approved_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Constraints
ALTER TABLE gtm_strategies
  DROP CONSTRAINT IF EXISTS gtm_strategies_status_check,
  DROP CONSTRAINT IF EXISTS gtm_strategies_gate_score_check;

ALTER TABLE gtm_strategies
  ADD CONSTRAINT gtm_strategies_status_check
    CHECK (status IN (
      'draft', 'synthesized', 'gate_review', 'gate_rejected',
      'gate_approved', 'client_sent', 'client_iteration', 'client_approved'
    )),
  ADD CONSTRAINT gtm_strategies_gate_score_check
    CHECK (gate_score IS NULL OR (gate_score BETWEEN 0 AND 100));

-- Indexen
CREATE INDEX IF NOT EXISTS idx_gtm_strategies_client
  ON gtm_strategies(client_id);

CREATE INDEX IF NOT EXISTS idx_gtm_strategies_status
  ON gtm_strategies(status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gtm_strategies_client_version
  ON gtm_strategies(client_id, version);

-- RLS
ALTER TABLE gtm_strategies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gtm_strategies_service_only" ON gtm_strategies;
CREATE POLICY "gtm_strategies_service_only" ON gtm_strategies
  USING (auth.role() = 'service_role');

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gtm_strategies_updated_at ON gtm_strategies;
CREATE TRIGGER gtm_strategies_updated_at
  BEFORE UPDATE ON gtm_strategies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 2. campaign_cells: wijzigen voor strategy link ─────────────────────────

-- Alleen toevoegen als tabel al bestaat (uit 20260402000002_gtm_schema.sql)
DO $$
BEGIN
  -- Strategy_id FK toevoegen
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_cells' AND column_name = 'strategy_id'
  ) THEN
    ALTER TABLE campaign_cells ADD COLUMN strategy_id UUID
      REFERENCES gtm_strategies(id) ON DELETE CASCADE;
  END IF;

  -- Combination keys toevoegen
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_cells' AND column_name = 'solution_key'
  ) THEN
    ALTER TABLE campaign_cells ADD COLUMN solution_key TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_cells' AND column_name = 'icp_key'
  ) THEN
    ALTER TABLE campaign_cells ADD COLUMN icp_key TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_cells' AND column_name = 'persona_key'
  ) THEN
    ALTER TABLE campaign_cells ADD COLUMN persona_key TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_cells' AND column_name = 'offer_key'
  ) THEN
    ALTER TABLE campaign_cells ADD COLUMN offer_key TEXT;
  END IF;

  -- Status splitsen in status + run_phase
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_cells' AND column_name = 'run_phase'
  ) THEN
    ALTER TABLE campaign_cells ADD COLUMN run_phase TEXT DEFAULT 'PILOT';
  END IF;

  -- Snapshot immutable
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_cells' AND column_name = 'snapshot'
  ) THEN
    ALTER TABLE campaign_cells ADD COLUMN snapshot JSONB;
  END IF;

  -- Overrides
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

-- Constraints voor campaign_cells
-- Bestaande cell_status hernoemen/uitbreiden naar nieuwe status waarden
ALTER TABLE campaign_cells
  DROP CONSTRAINT IF EXISTS campaign_cells_cell_status_check,
  DROP CONSTRAINT IF EXISTS campaign_cells_status_check,
  DROP CONSTRAINT IF EXISTS campaign_cells_run_phase_check;

-- Hernoem cell_status naar status als die bestaat
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_cells' AND column_name = 'cell_status'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_cells' AND column_name = 'status'
  ) THEN
    ALTER TABLE campaign_cells RENAME COLUMN cell_status TO status;
  END IF;
END $$;

-- Voeg status toe als die nog mist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_cells' AND column_name = 'status'
  ) THEN
    ALTER TABLE campaign_cells ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
  END IF;
END $$;

-- Constraints toevoegen
ALTER TABLE campaign_cells
  ADD CONSTRAINT campaign_cells_status_check
    CHECK (status IN (
      'draft', 'pilot_copy', 'H1_testing', 'H1_winner', 'F1_testing',
      'F1_winner', 'CTA1_testing', 'soft_launch', 'scaling', 'killed'
    )),
  ADD CONSTRAINT campaign_cells_run_phase_check
    CHECK (run_phase IN ('PILOT', 'H1', 'F1', 'CTA1', 'SCALE', 'KILLED'));

-- Indexen
CREATE INDEX IF NOT EXISTS idx_campaign_cells_strategy
  ON campaign_cells(strategy_id);

CREATE INDEX IF NOT EXISTS idx_campaign_cells_run_phase
  ON campaign_cells(run_phase);

-- ── 3. Snapshot immutability trigger ───────────────────────────────────────

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

-- ── 4. Updated_at trigger voor campaign_cells ──────────────────────────────

DROP TRIGGER IF EXISTS campaign_cells_updated_at ON campaign_cells;
CREATE TRIGGER campaign_cells_updated_at
  BEFORE UPDATE ON campaign_cells
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 5. Comments voor JSONB shape ───────────────────────────────────────────

COMMENT ON COLUMN gtm_strategies.solutions_json IS '
Schema: [
  {
    "key": "solution_1",
    "name": "...",
    "description": "...",
    "target_icps": ["icp_1", "icp_2"]
  }
]
';

COMMENT ON COLUMN gtm_strategies.icp_segments_json IS '
Schema: [
  {
    "key": "icp_1",
    "name": "...",
    "description": "...",
    "aleads_config": { "include": {...}, "exclude": {...} }
  }
]
';

COMMENT ON COLUMN gtm_strategies.buyer_personas_json IS '
Schema: [
  {
    "key": "persona_1",
    "title": "VP Sales",
    "pain_points": [...],
    "triggers": [...]
  }
]
';

COMMENT ON COLUMN gtm_strategies.entry_offers_json IS '
Schema: [
  {
    "key": "offer_1",
    "type": "audit|case|insight|soft_cta",
    "name": "...",
    "description": "...",
    "cta_text": "..."
  }
]
';

COMMENT ON COLUMN campaign_cells.snapshot IS '
Immutable snapshot at creation. Schema:
{
  "created_at": "...",
  "solution": { "key": "...", "name": "...", ... },
  "icp": { "key": "...", "name": "...", ... },
  "persona": { "key": "...", "title": "...", ... },
  "offer": { "key": "...", "type": "...", ... }
}
';

-- ── 6. Data migratie (indien oude structuur bestaat) ───────────────────────

-- Migreer clients.gtm_synthesis naar gtm_strategies (indien van toepassing)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'gtm_synthesis'
  ) AND NOT EXISTS (
    SELECT 1 FROM gtm_strategies LIMIT 1
  ) THEN
    INSERT INTO gtm_strategies (
      client_id,
      solutions_json,
      icp_segments_json,
      buyer_personas_json,
      entry_offers_json,
      status
    )
    SELECT
      id,
      COALESCE(gtm_synthesis->'solutions', '[]'),
      COALESCE(gtm_synthesis->'icp_segments', '[]'),
      COALESCE(gtm_synthesis->'personas', '[]'),
      COALESCE(gtm_synthesis->'entry_offers', '[]'),
      COALESCE(gtm_synthesis->>'gate_status', 'draft')
    FROM clients
    WHERE gtm_synthesis IS NOT NULL AND gtm_synthesis != '{}';

    RAISE NOTICE 'Migrated gtm_synthesis to gtm_strategies';
  END IF;
END $$;
