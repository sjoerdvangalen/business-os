-- GTM Strategy Framework v4 — Complete Schema
-- 10 tabellen voor end-to-end GTM strategie, segmentatie, en campagne management
-- Volgorde: afhankelijkheden van boven naar beneden (FK constraints)

-- ============================================================
-- 1. GTM STRATEGIES — Hoofdcontainer per client
-- ============================================================

CREATE TABLE IF NOT EXISTS gtm_strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL, -- e.g. "SECX-GTM-2025"
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  version int NOT NULL DEFAULT 1,
  doc1_url text,
  doc2_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','approved','active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gtm_strategies_client_id_idx ON gtm_strategies(client_id);
CREATE INDEX IF NOT EXISTS gtm_strategies_status_idx ON gtm_strategies(status);

-- ============================================================
-- 2. SOLUTIONS — Wat verkopen we?
-- ============================================================

CREATE TABLE IF NOT EXISTS solutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gtm_strategy_id uuid NOT NULL REFERENCES gtm_strategies(id) ON DELETE CASCADE,
  solution_name text NOT NULL,
  commercial_label text,
  core_problem text,
  dream_outcome text,
  pain_points jsonb DEFAULT '[]'::jsonb,         -- 3-5 specifieke pijnpunten
  best_fit_contexts jsonb DEFAULT '[]'::jsonb,    -- 3-5 use case contexts
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS solutions_gtm_strategy_id_idx ON solutions(gtm_strategy_id);

-- ============================================================
-- 3. ICP SEGMENTS — Aan wie verkopen we?
-- ============================================================

CREATE TABLE IF NOT EXISTS icp_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gtm_strategy_id uuid NOT NULL REFERENCES gtm_strategies(id) ON DELETE CASCADE,
  segment_name text NOT NULL,
  company_type text,
  context_description text,
  hard_blocks jsonb DEFAULT '[]'::jsonb,
  trigger_events jsonb DEFAULT '[]'::jsonb,
  pain_indicators jsonb DEFAULT '[]'::jsonb,
  technographic_signals jsonb DEFAULT '[]'::jsonb,
  firmographic_criteria jsonb DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS icp_segments_gtm_strategy_id_idx ON icp_segments(gtm_strategy_id);

-- ============================================================
-- 4. BUYER PERSONAS — Met wie praten we?
-- ============================================================

CREATE TABLE IF NOT EXISTS buyer_personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gtm_strategy_id uuid NOT NULL REFERENCES gtm_strategies(id) ON DELETE CASCADE,
  persona_name text NOT NULL,
  role_title text,
  department text,
  seniority_level text,
  kpis jsonb DEFAULT '[]'::jsonb,
  pain_analysis jsonb DEFAULT '{}'::jsonb, -- {operational, strategic, personal, financial}
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS buyer_personas_gtm_strategy_id_idx ON buyer_personas(gtm_strategy_id);

-- ============================================================
-- 5. ENTRY OFFERS — Wat bieden we aan?
-- ============================================================

CREATE TABLE IF NOT EXISTS entry_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gtm_strategy_id uuid NOT NULL REFERENCES gtm_strategies(id) ON DELETE CASCADE,
  solution_id uuid NOT NULL REFERENCES solutions(id) ON DELETE CASCADE,
  offer_name text NOT NULL,
  offer_type text NOT NULL, -- diagnose, proof_send, pilot, benchmark, checklist, sample
  -- Friction rubric (score each 1-5)
  friction_time int CHECK (friction_time BETWEEN 1 AND 5),         -- 1=minutes, 5=days of their time
  friction_effort int CHECK (friction_effort BETWEEN 1 AND 5),     -- 1=passive receive, 5=active work
  friction_trust int CHECK (friction_trust BETWEEN 1 AND 5),       -- 1=no trust needed, 5=high trust
  friction_complexity int CHECK (friction_complexity BETWEEN 1 AND 5), -- 1=simple, 5=complex coordination
  friction_score int CHECK (friction_score BETWEEN 1 AND 5),       -- calculated: round(avg of above 4)
  deliverable_type text,
  proof_dependency text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entry_offers_gtm_strategy_id_idx ON entry_offers(gtm_strategy_id);
CREATE INDEX IF NOT EXISTS entry_offers_solution_id_idx ON entry_offers(solution_id);

-- ============================================================
-- 6. PROOF ASSETS — Waarmee bewijzen we het?
-- ============================================================

CREATE TABLE IF NOT EXISTS proof_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gtm_strategy_id uuid NOT NULL REFERENCES gtm_strategies(id) ON DELETE CASCADE,
  solution_id uuid NOT NULL REFERENCES solutions(id) ON DELETE CASCADE,
  asset_name text NOT NULL,
  asset_type text NOT NULL, -- case_study, testimonial, benchmark, internal_data, concept_note
  proof_level text NOT NULL, -- verified, directional, hypothesis_only
  verified_status boolean NOT NULL DEFAULT false,
  usable_in_h1 boolean NOT NULL DEFAULT false,
  usable_in_f1 boolean NOT NULL DEFAULT false,
  send_mode text NOT NULL DEFAULT 'internal_only' CHECK (send_mode IN ('sendable','mention_only','internal_only')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS proof_assets_gtm_strategy_id_idx ON proof_assets(gtm_strategy_id);
CREATE INDEX IF NOT EXISTS proof_assets_solution_id_idx ON proof_assets(solution_id);

-- ============================================================
-- 7. CAMPAIGN CELLS — De unit of work (Strategy + Targeting + Offer)
-- ============================================================

CREATE TABLE IF NOT EXISTS campaign_cells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable cell identity (NEVER includes test phase or version)
  cell_code text UNIQUE NOT NULL,   -- format: CLIENTCODE | Language | Solution Segment Persona Region
  cell_slug text UNIQUE NOT NULL,   -- machine-safe kebab: clientcode-solution-segment-persona-region
  gtm_strategy_id uuid NOT NULL REFERENCES gtm_strategies(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id),   -- direct ref (avoid join via gtm_strategy)
  solution_id uuid NOT NULL REFERENCES solutions(id),
  segment_id uuid NOT NULL REFERENCES icp_segments(id),
  primary_persona_id uuid NOT NULL REFERENCES buyer_personas(id),
  entry_offer_id uuid NOT NULL REFERENCES entry_offers(id),
  proof_asset_id uuid REFERENCES proof_assets(id),  -- nullable

  -- Strategy (JSON voor flexibiliteit)
  hard_blocks jsonb DEFAULT '[]'::jsonb,
  trigger_events jsonb DEFAULT '[]'::jsonb,
  primary_pain text,
  secondary_pains jsonb DEFAULT '[]'::jsonb,
  metric_under_pressure text,
  why_now text,
  disqualifiers jsonb DEFAULT '[]'::jsonb,
  secondary_awareness_stage text,
  hook_themes jsonb DEFAULT '[]'::jsonb,

  -- Prioritization
  pain_intensity_score int CHECK (pain_intensity_score BETWEEN 1 AND 5),
  proof_fit_score int CHECK (proof_fit_score BETWEEN 1 AND 5),
  trigger_strength_score int CHECK (trigger_strength_score BETWEEN 1 AND 5),
  market_size_score int CHECK (market_size_score BETWEEN 1 AND 5),
  list_availability_score int CHECK (list_availability_score BETWEEN 1 AND 5),
  execution_ease_score int CHECK (execution_ease_score BETWEEN 1 AND 5),
  priority_score int,               -- calculated sum of above 6 scores
  priority_formula_version text DEFAULT 'v1.0',
  priority_reasoning text,
  cell_threshold_reasoning text,

  -- Status
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','active','paused','completed','archived')),
  status_history jsonb DEFAULT '[]'::jsonb,  -- [{status, changed_at, reason}]
  approved_at timestamptz,
  launched_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,

  doc3_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_cells_gtm_strategy_id_idx ON campaign_cells(gtm_strategy_id);
CREATE INDEX IF NOT EXISTS campaign_cells_client_id_idx ON campaign_cells(client_id);
CREATE INDEX IF NOT EXISTS campaign_cells_solution_id_idx ON campaign_cells(solution_id);
CREATE INDEX IF NOT EXISTS campaign_cells_status_idx ON campaign_cells(status);
CREATE INDEX IF NOT EXISTS campaign_cells_priority_score_idx ON campaign_cells(priority_score);

-- ============================================================
-- 8. CAMPAIGN RUNS — Testfases (H1/F1/CTA1/MC1/SCALE)
-- ============================================================

CREATE TABLE IF NOT EXISTS campaign_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Run identity: cell + phase + version
  run_code text UNIQUE NOT NULL,   -- format: cell_code | TESTPHASE | Vn
  run_slug text UNIQUE NOT NULL,   -- machine-safe kebab: cell_slug-h1-v1
  campaign_cell_id uuid NOT NULL REFERENCES campaign_cells(id) ON DELETE CASCADE,
  test_phase text NOT NULL CHECK (test_phase IN ('H1','F1','CTA1','MC1','SCALE')),
  version int NOT NULL DEFAULT 1,

  -- PlusVibe link (per run = per PlusVibe campaign)
  plusvibe_campaign_id text,       -- link naar PlusVibe campaign voor deze run

  -- Run config
  cta_type text,                   -- info-send, case-study-send, audit, benchmark, pilot
  hook_variant_count int,
  framework_variant_count int,
  sample_size_target int,

  -- Invariants: what stayed fixed this run
  invariant_snapshot jsonb DEFAULT '{}'::jsonb, -- {hook, framework, cta, proof_asset_id}

  -- Results
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','completed','abandoned')),
  started_at timestamptz,
  completed_at timestamptz,
  winning_variant_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_runs_campaign_cell_id_idx ON campaign_runs(campaign_cell_id);
CREATE INDEX IF NOT EXISTS campaign_runs_test_phase_idx ON campaign_runs(test_phase);
CREATE INDEX IF NOT EXISTS campaign_runs_plusvibe_campaign_id_idx ON campaign_runs(plusvibe_campaign_id);
CREATE INDEX IF NOT EXISTS campaign_runs_status_idx ON campaign_runs(status);

-- ============================================================
-- 9. CAMPAIGN VARIANTS — A/B test varianten (hook/framework/CTA)
-- ============================================================

CREATE TABLE IF NOT EXISTS campaign_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_run_id uuid NOT NULL REFERENCES campaign_runs(id) ON DELETE CASCADE,
  variant_label text NOT NULL,     -- "Hook A", "Hook B", "Framework: before-after"
  variant_type text NOT NULL CHECK (variant_type IN ('hook','framework','cta','micro')),
  copy_snapshot jsonb DEFAULT '{}'::jsonb, -- {subject, opener, body, cta} op moment van lancering

  -- Metrics (dagelijks gesynchroniseerd)
  emails_sent int NOT NULL DEFAULT 0,
  emails_delivered int NOT NULL DEFAULT 0,
  replies int NOT NULL DEFAULT 0,
  positive_replies int NOT NULL DEFAULT 0,
  meetings_booked int NOT NULL DEFAULT 0,

  -- Rates (berekend)
  positive_reply_rate numeric(5,4),   -- positive_replies / emails_sent
  meeting_rate numeric(5,4),          -- meetings_booked / emails_sent

  is_winner boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_variants_campaign_run_id_idx ON campaign_variants(campaign_run_id);
CREATE INDEX IF NOT EXISTS campaign_variants_variant_type_idx ON campaign_variants(variant_type);
CREATE INDEX IF NOT EXISTS campaign_variants_is_winner_idx ON campaign_variants(is_winner);

-- ============================================================
-- 10. CAMPAIGN METRICS — Dagelijkse snapshot (denormalized voor performance)
-- ============================================================

CREATE TABLE IF NOT EXISTS campaign_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_cell_id uuid NOT NULL REFERENCES campaign_cells(id) ON DELETE CASCADE,
  campaign_run_id uuid REFERENCES campaign_runs(id) ON DELETE SET NULL,
  plusvibe_campaign_id text,
  snapshot_date date NOT NULL,
  emails_sent int NOT NULL DEFAULT 0,
  emails_delivered int NOT NULL DEFAULT 0,
  -- open_rate NOT tracked: tracking pixel hurts deliverability
  replies int NOT NULL DEFAULT 0,
  positive_replies int NOT NULL DEFAULT 0,
  meetings_booked int NOT NULL DEFAULT 0,
  qualified_meetings int,           -- nullable: only tracked for some clients
  -- Rates (full names to avoid MRR confusion)
  positive_reply_rate numeric(5,4), -- positive_replies / emails_sent
  meeting_rate numeric(5,4),        -- meetings_booked / emails_sent
  qualified_meeting_rate numeric(5,4), -- qualified_meetings / emails_sent (null if not tracked)
  raw_data jsonb DEFAULT '{}'::jsonb,  -- volledige PlusVibe response
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_cell_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS campaign_metrics_campaign_cell_id_idx ON campaign_metrics(campaign_cell_id);
CREATE INDEX IF NOT EXISTS campaign_metrics_snapshot_date_idx ON campaign_metrics(snapshot_date);
CREATE INDEX IF NOT EXISTS campaign_metrics_campaign_run_id_idx ON campaign_metrics(campaign_run_id);
CREATE INDEX IF NOT EXISTS campaign_metrics_plusvibe_campaign_id_idx ON campaign_metrics(plusvibe_campaign_id);

-- ============================================================
-- RLS ENABLE (beveiliging)
-- ============================================================

ALTER TABLE gtm_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE solutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE icp_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyer_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE proof_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_metrics ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- UPDATED_AT TRIGGERS (gebruik bestaande functie)
-- PostgreSQL ondersteunt geen CREATE TRIGGER IF NOT EXISTS
-- ============================================================

DROP TRIGGER IF EXISTS update_gtm_strategies_updated_at ON gtm_strategies;
CREATE TRIGGER update_gtm_strategies_updated_at BEFORE UPDATE ON gtm_strategies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_solutions_updated_at ON solutions;
CREATE TRIGGER update_solutions_updated_at BEFORE UPDATE ON solutions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_icp_segments_updated_at ON icp_segments;
CREATE TRIGGER update_icp_segments_updated_at BEFORE UPDATE ON icp_segments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_buyer_personas_updated_at ON buyer_personas;
CREATE TRIGGER update_buyer_personas_updated_at BEFORE UPDATE ON buyer_personas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_entry_offers_updated_at ON entry_offers;
CREATE TRIGGER update_entry_offers_updated_at BEFORE UPDATE ON entry_offers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_proof_assets_updated_at ON proof_assets;
CREATE TRIGGER update_proof_assets_updated_at BEFORE UPDATE ON proof_assets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_campaign_cells_updated_at ON campaign_cells;
CREATE TRIGGER update_campaign_cells_updated_at BEFORE UPDATE ON campaign_cells FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_campaign_runs_updated_at ON campaign_runs;
CREATE TRIGGER update_campaign_runs_updated_at BEFORE UPDATE ON campaign_runs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_campaign_variants_updated_at ON campaign_variants;
CREATE TRIGGER update_campaign_variants_updated_at BEFORE UPDATE ON campaign_variants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_campaign_metrics_updated_at ON campaign_metrics;
CREATE TRIGGER update_campaign_metrics_updated_at BEFORE UPDATE ON campaign_metrics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- VIEWS VOOR DASHBOARD (optioneel, kunnen later worden aangemaakt)
-- ============================================================

-- Aggregated cell performance view (kan later worden toegevoegd)
-- CREATE OR REPLACE VIEW v_cell_performance AS ...

-- Aggregated run results view (kan later worden toegevoegd)
-- CREATE OR REPLACE VIEW v_run_results AS ...

-- GTM strategy summary view (kan later worden toegevoegd)
-- CREATE OR REPLACE VIEW v_gtm_summary AS ...

-- ============================================================
-- COMMENTS VOOR DOCUMENTATIE
-- ============================================================

COMMENT ON TABLE gtm_strategies IS 'Hoofdcontainer voor GTM strategie per client';
COMMENT ON TABLE solutions IS 'Producten/diensten met pijnpunten en use cases';
COMMENT ON TABLE icp_segments IS 'Ideal Customer Profile segmenten';
COMMENT ON TABLE buyer_personas IS 'Beslissers en beïnvloeders';
COMMENT ON TABLE entry_offers IS 'Low-friction entry points (friction rubric)';
COMMENT ON TABLE proof_assets IS 'Case studies, testimonials, benchmarks';
COMMENT ON TABLE campaign_cells IS 'De unit of work: Strategy + Segment + Persona + Offer';
COMMENT ON TABLE campaign_runs IS 'Testfases: H1, F1, CTA1, MC1, SCALE';
COMMENT ON TABLE campaign_variants IS 'A/B test varianten voor hooks, frameworks, CTAs';
COMMENT ON TABLE campaign_metrics IS 'Dagelijkse performance snapshots (denormalized)';

-- Friction rubric comments
COMMENT ON COLUMN entry_offers.friction_time IS '1=minuten, 5=dagen van hun tijd';
COMMENT ON COLUMN entry_offers.friction_effort IS '1=passief ontvangen, 5=actief werk';
COMMENT ON COLUMN entry_offers.friction_trust IS '1=geen trust nodig, 5=hoog vertrouwen';
COMMENT ON COLUMN entry_offers.friction_complexity IS '1=eenvoudig, 5=complexe coordinatie';
COMMENT ON COLUMN entry_offers.friction_score IS 'Berekend: round(gemiddelde van 4 scores)';

-- Priority score comments
COMMENT ON COLUMN campaign_cells.priority_score IS 'Som van 6 scores (1-5 elk), max 30';
COMMENT ON COLUMN campaign_cells.pain_intensity_score IS 'Hoe sterk is de pijn (1-5)';
COMMENT ON COLUMN campaign_cells.proof_fit_score IS 'Hoe sterk past ons proof (1-5)';
COMMENT ON COLUMN campaign_cells.trigger_strength_score IS 'Hoe sterk zijn de triggers (1-5)';
COMMENT ON COLUMN campaign_cells.market_size_score IS 'Hoe groot is de markt (1-5)';
COMMENT ON COLUMN campaign_cells.list_availability_score IS 'Hoe goed zijn lijsten beschikbaar (1-5)';
COMMENT ON COLUMN campaign_cells.execution_ease_score IS 'Hoe makkelijk is uitvoering (1-5)';
