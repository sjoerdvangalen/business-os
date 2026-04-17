-- ═══════════════════════════════════════════════════════════════════════════
-- GTM Pipeline Fields Migration
-- Voegt pipeline orchestration kolommen toe aan clients tabel
-- Hernoemt deep_research → exa_research (semantisch correct, geen dataverlies)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. deep_research hernoemen naar exa_research ────────────────────────────
-- Bestaande kolom, bestaande data — alleen naam aanpassen

ALTER TABLE clients RENAME COLUMN deep_research TO exa_research;

-- ── 2. Nieuwe kolommen toevoegen ────────────────────────────────────────────

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS gtm_strategy_doc_url          TEXT,
  ADD COLUMN IF NOT EXISTS gtm_strategy_doc_external_url TEXT,
  ADD COLUMN IF NOT EXISTS messaging_doc_url             TEXT,
  ADD COLUMN IF NOT EXISTS workflow_metrics              JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pipeline_status               JSONB DEFAULT '{}';

-- ── 3. gate_status constraint uitbreiden (nieuwe approval waarden) ──────────
-- Alle 20 bestaande rows hebben gate_status = 'draft' — safe to replace

ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS clients_gate_status_check;

ALTER TABLE clients
  ADD CONSTRAINT clients_gate_status_check
    CHECK (gate_status IN (
      'draft',
      'synthesized',
      'internal_review',
      'internal_approved',
      'internal_rejected',
      'external_sent',
      'external_iteration',
      'external_approved'
    ));

-- ── 4. Comments ─────────────────────────────────────────────────────────────

COMMENT ON COLUMN clients.exa_research IS
  'Exa deep research output: {status, task_id, result, created_at, fetched_at, error}';

COMMENT ON COLUMN clients.strategy_synthesis IS
  'GTM Strategy Synthesizer output v1 — één canonical object. Internal/external = render filter, niet ander object.';

COMMENT ON COLUMN clients.gtm_strategy_doc_url IS
  'Internal Google Doc — inclusief risks, assumptions, internal_notes';

COMMENT ON COLUMN clients.gtm_strategy_doc_external_url IS
  'External client-facing Google Doc — risks en internal_notes uitgefilterd';

COMMENT ON COLUMN clients.messaging_doc_url IS
  'Messaging layer doc: strategy, angle directions, proof usage, tone, draft hooks/subjects/copy';

COMMENT ON COLUMN clients.workflow_metrics IS
  'Timing + feedback per approval-blok: intake, internal_approval, external_approval, messaging_approval, sourcing_review, totals';

COMMENT ON COLUMN clients.pipeline_status IS
  '3 operationele lanes: strategy_side (0_intake→4_ready_for_campaign), infra_side (0_not_started→3_ready), campaign_side (0_not_started→7_scaling)';

COMMENT ON COLUMN clients.gate_status IS
  'Technische approval state machine. Flow-termen: internal_approval / external_approval. Waarden: draft→synthesized→internal_review→internal_approved|internal_rejected→external_sent→external_iteration|external_approved';

-- ── 5. Deprecated kolommen markeren (niet verwijderen) ─────────────────────

COMMENT ON COLUMN clients.icp_segments IS
  'DEPRECATED_READONLY: nu in strategy_synthesis.icp_segments. Niet meer schrijven. Oude data beschikbaar voor referentie.';

COMMENT ON COLUMN clients.campaign_cells IS
  'DEPRECATED_READONLY: nu in campaign_cells tabel. Niet meer schrijven. Oude data beschikbaar voor referentie.';
