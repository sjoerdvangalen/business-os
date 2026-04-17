-- ═══════════════════════════════════════════════════════════════════════════
-- Client Project Phases Migration
-- Fase-tracking per client voor GTM pipeline visibility
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Phase enum type ─────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'client_phase') THEN
    CREATE TYPE client_phase AS ENUM (
      '0_onboarding',           -- Intake, client row aangemaakt
      '1_strategy',             -- Solutions, pain, ICP, persona, offer
      '2_internal_gate',        -- Gate review, score ≥80
      '3_client_approval',      -- Klant akkoord op strategie
      '4_infra',                -- Domeinen, inboxes, warmup
      '5_data_pipeline',        -- A-Leads config, bedrijven, contacts, verify
      '6_campaign_setup',       -- Cells, snapshot, copy, PlusVibe ready
      '7_pilot',                -- Live, observatie, geen kill decisions
      '8_H1_testing',           -- Hook test, 300+ delivered per variant
      '9_F1_testing',           -- Framework test, 500+ delivered
      '10_CTA1_testing',        -- Offer/CTA test, 300+ delivered
      '11_soft_launch',         -- Winner live, 1+ meeting geboekt
      '12_scaling'              -- Volume op, kill logic actief
    );
  END IF;
END
$$;

-- ── 2. clients tabel: phase kolom ──────────────────────────────────────────

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS phase client_phase DEFAULT '0_onboarding',
  ADD COLUMN IF NOT EXISTS phase_updated_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS phase_blocked_by TEXT,        -- Waarom stil?
  ADD COLUMN IF NOT EXISTS phase_blocked_at TIMESTAMPTZ, -- Wanneer stil?
  ADD COLUMN IF NOT EXISTS phase_notes TEXT;             -- Context

-- ── 3. Phase transition log ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_phase_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  from_phase      client_phase,
  to_phase        client_phase NOT NULL,
  triggered_by    TEXT,           -- skill name of manual action
  triggered_by_user TEXT,         -- wie deed het (bij manual)
  reason          TEXT,           -- waarom deze transitie
  metadata        JSONB,          -- extra context (gate_score, etc.)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index voor snel client history opvragen
CREATE INDEX IF NOT EXISTS idx_client_phase_log_client
  ON client_phase_log (client_id, created_at DESC);

-- ── 4. Auto-log trigger ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION log_phase_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.phase IS DISTINCT FROM NEW.phase THEN
    INSERT INTO client_phase_log (
      client_id, from_phase, to_phase, reason, metadata
    ) VALUES (
      NEW.id,
      OLD.phase,
      NEW.phase,
      COALESCE(NEW.phase_notes, 'Automatic transition'),
      jsonb_build_object(
        'gate_score', NEW.strategy->>'gate_score',
        'phase_blocked_by', NEW.phase_blocked_by
      )
    );
    NEW.phase_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS client_phase_transition ON clients;
CREATE TRIGGER client_phase_transition
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION log_phase_transition();

-- ── 5. View: client pipeline status ────────────────────────────────────────

CREATE OR REPLACE VIEW client_pipeline_status AS
SELECT
  c.id,
  c.client_code,
  c.name,
  c.phase,
  c.phase_updated_at,
  c.phase_blocked_by,
  c.phase_blocked_at,
  c.phase_notes,
  -- Hoe lang in huidige fase?
  EXTRACT(EPOCH FROM (now() - c.phase_updated_at)) / 3600 as hours_in_phase,
  -- Laatste log entry
  latest_log.from_phase as previous_phase,
  latest_log.created_at as last_transition_at,
  latest_log.reason as last_transition_reason,
  -- Gate info uit strategy
  c.strategy->>'gate_status' as gate_status,
  (c.strategy->>'gate_score')::int as gate_score,
  -- Infra status (aggregatie)
  (
    SELECT COUNT(*) FROM email_inboxes ei
    WHERE ei.client_id = c.id AND ei.sending_status = 'active'
  ) as active_inboxes,
  -- Campaign cell count
  (
    SELECT COUNT(*) FROM campaign_cells cc
    WHERE cc.client_id = c.id
  ) as cell_count,
  -- Laatste meeting
  (
    SELECT m.start_time FROM meetings m
    WHERE m.client_id = c.id AND m.booking_status = 'completed'
    ORDER BY m.start_time DESC LIMIT 1
  ) as last_meeting_at
FROM clients c
LEFT JOIN LATERAL (
  SELECT * FROM client_phase_log
  WHERE client_id = c.id
  ORDER BY created_at DESC LIMIT 1
) latest_log ON true;

-- ── 6. RLS op phase log ───────────────────────────────────────────────────

ALTER TABLE client_phase_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_phase_log_service_only" ON client_phase_log
  USING (auth.role() = 'service_role');

-- ── 7. Comments voor documentatie ──────────────────────────────────────────

COMMENT ON TYPE client_phase IS '
0_onboarding      = Intake, research, client row aangemaakt
1_strategy        = Solutions, pain mapping, ICP, persona, offer
2_internal_gate   = Gate review (≥80 = approve, <65 = reject)
3_client_approval = Klant akkoord op strategie + messaging richting
4_infra           = Domeinen, inboxes provisioned, DNS, warmup
5_data_pipeline   = A-Leads config, bedrijven, contacts, Enrow verify
6_campaign_setup  = Cells aangemaakt, snapshot immutable, copy, PlusVibe ready
7_pilot           = Live, observatie, geen kill decisions
8_H1_testing      = Hook test (3-5 variants, 300+ delivered per variant)
9_F1_testing      = Framework test (3 angles, 500+ delivered)
10_CTA1_testing   = Offer/CTA test (3 CTAs, 300+ delivered)
11_soft_launch    = Winner live, 1+ meeting geboekt
12_scaling        = Volume op, kill logic actief, NRO/ELITS ready
';

COMMENT ON COLUMN clients.phase_blocked_by IS '
Waarom kan de client niet verder? Bijv: "waiting_gate_score", "waiting_client_feedback", "infra_dns_failed", "data_pipeline_insufficient_leads"
';
