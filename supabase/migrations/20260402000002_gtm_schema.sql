-- ============================================
-- GTM Schema
--
-- Toevoegingen:
--   1. contacts.email_waterfall_status — operationele status voor email-waterfall edge function
--   2. clients.gtm_synthesis — AI-synthesized strategy per client (solutions/ICP/personas/offers)
--   3. campaign_cells — atomaire eenheid: Strategy × ICP × Persona × Offer
--
-- Bewuste keuzes:
--   - gtm_strategies als aparte tabel NIET nodig: synthesis gaat als JSONB op clients
--   - campaign_runs als aparte tabel NIET nodig: runs gaan als JSONB array in campaign_cells.runs
--   - campaign_variants als aparte tabel NIET nodig: varianten zitten in de runs array
--   - campaign_cells.campaign_id FK → campaigns voor dashboard metric queries
-- ============================================

-- ── 1. contacts: voeg email_waterfall_status toe ──
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS email_waterfall_status TEXT DEFAULT 'pending'
    CHECK (email_waterfall_status IN ('pending', 'verified', 'cache_hit', 'failed', 'existing', 'skipped'));

COMMENT ON COLUMN contacts.email_waterfall_status IS 'Status van de email-waterfall verificatie pipeline';

-- ── 2. clients: voeg gtm_synthesis toe ──
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS gtm_synthesis JSONB DEFAULT '{}';

COMMENT ON COLUMN clients.gtm_synthesis IS 'AI-synthesized GTM strategy per client. Schema: { solutions[], icp_segments[], personas[], entry_offers[], recommended_cells[], gate_status, google_doc_url }';

-- ── 3. campaign_cells ──
-- Drop old FK-based design (0 rows, replaced by JSONB brief+runs approach)
DROP TABLE IF EXISTS campaign_cells CASCADE;

CREATE TABLE campaign_cells (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id           UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  -- FK naar campaigns is nullable: NULL zolang PlusVibe campaign nog niet aangemaakt is

  -- Identiteit (afgeleid van Strategy × ICP × Persona × Offer)
  cell_code             TEXT NOT NULL,   -- "SECX | NL | Routing SaaS-NL VPOps EMEA"
  cell_slug             TEXT NOT NULL,   -- "secx-nl-routing-saas-nl-vpops-emea"

  -- Flat dimensies (nodig voor GROUP BY in dashboard queries)
  solution_name         TEXT NOT NULL,
  segment_name          TEXT NOT NULL,
  persona_name          TEXT NOT NULL,
  language              TEXT NOT NULL DEFAULT 'EN',
  region                TEXT NOT NULL DEFAULT 'NL',

  -- Status lifecycle
  cell_status           TEXT NOT NULL DEFAULT 'brief_ready'
                          CHECK (cell_status IN (
                            'brief_ready',   -- brief gegenereerd, geen PlusVibe campaign
                            'live',          -- PlusVibe campaign aangemaakt en gelinkt
                            'testing',       -- H1/F1/CTA1 loopt
                            'scaling',       -- SCALE fase
                            'paused',
                            'closed'
                          )),

  -- Prioritering
  priority_score        INT NOT NULL DEFAULT 70,

  -- Volledige cell brief + A-Leads config (JSONB — details die nooit worden gefiltered)
  brief                 JSONB NOT NULL DEFAULT '{}',
  -- Schema van brief:
  -- {
  --   "offer_name": "...",
  --   "offer_type": "audit|case|insight|soft_cta",
  --   "hook_themes": [{ "theme_name": "...", "theme_category": "..." }],
  --   "hard_blocks": [...],
  --   "trigger_events": [...],
  --   "pain_mapping": { "operational": "...", "financial": "...", "strategic": "..." },
  --   "disqualifiers": [...],
  --   "aleads_config": {
  --     "industry": [...],
  --     "headcount": { "min": 50, "max": 500 },
  --     "country": [...],
  --     "keywords_include": [...],
  --     "keywords_exclude": [...],
  --     "job_titles": [...],
  --     "volume": 1000
  --   }
  -- }

  -- Test-fase geschiedenis (vervangt campaign_runs + campaign_variants tabellen)
  runs                  JSONB NOT NULL DEFAULT '[]',
  -- Array van test-fasen, elk:
  -- {
  --   "phase": "H1|F1|CTA1|MC1|SCALE",
  --   "started_at": "...",
  --   "concluded_at": "...",
  --   "winner": true|false|null,
  --   "conclusion": "...",
  --   "next_action": "...",
  --   "hypothesis": "...",
  --   "target_volume": 1000,
  --   "variants": [{ "label": "...", "subject": "...", "opener": "...", "body": "...", "cta": "..." }]
  -- }

  -- Timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unieke constraint: één cell per client per slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_cells_slug
  ON campaign_cells(client_id, cell_slug);

-- Performance indexen
CREATE INDEX IF NOT EXISTS idx_campaign_cells_client
  ON campaign_cells(client_id);

CREATE INDEX IF NOT EXISTS idx_campaign_cells_campaign
  ON campaign_cells(campaign_id)
  WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_cells_status
  ON campaign_cells(cell_status);

-- Dashboard GROUP BY indexen
CREATE INDEX IF NOT EXISTS idx_campaign_cells_solution
  ON campaign_cells(solution_name);

CREATE INDEX IF NOT EXISTS idx_campaign_cells_segment
  ON campaign_cells(segment_name);

CREATE INDEX IF NOT EXISTS idx_campaign_cells_persona
  ON campaign_cells(persona_name);

CREATE INDEX IF NOT EXISTS idx_campaign_cells_priority
  ON campaign_cells(priority_score DESC);

-- Updated_at trigger
DROP TRIGGER IF EXISTS campaign_cells_updated_at ON campaign_cells;
CREATE TRIGGER campaign_cells_updated_at
  BEFORE UPDATE ON campaign_cells
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE campaign_cells ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency staff see all cells" ON campaign_cells
  FOR SELECT USING (current_user_role() IN ('agency_admin', 'agency_staff'));

CREATE POLICY "client viewer sees own cells" ON campaign_cells
  FOR SELECT USING (
    current_user_role() = 'client_viewer'
    AND client_id = current_user_client_id()
  );

CREATE POLICY "agency admin manage cells" ON campaign_cells
  FOR ALL USING (current_user_role() = 'agency_admin');

CREATE POLICY "agency staff insert cells" ON campaign_cells
  FOR INSERT WITH CHECK (current_user_role() IN ('agency_admin', 'agency_staff'));

CREATE POLICY "agency staff update cells" ON campaign_cells
  FOR UPDATE USING (current_user_role() IN ('agency_admin', 'agency_staff'));

COMMENT ON TABLE campaign_cells IS 'Atomaire GTM execution units: Strategy × ICP × Persona × Offer. Runs (H1/F1/CTA1/SCALE) en varianten zitten als JSONB in de runs kolom.';
