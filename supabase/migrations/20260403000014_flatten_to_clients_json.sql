-- ═══════════════════════════════════════════════════════════════════════════
-- Flatten to Clients JSON Migration
-- Verwijdert aparte tabellen, verplaatst alles naar clients tabel als JSONB
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Clients tabel: JSONB kolommen toevoegen ──────────────────────────────

ALTER TABLE clients
  -- Strategy & Gate (was: gtm_strategies)
  ADD COLUMN IF NOT EXISTS strategy JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS gate_status TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS gate_score INT,
  ADD COLUMN IF NOT EXISTS gate_feedback TEXT,
  ADD COLUMN IF NOT EXISTS gate_iterations INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS client_approved_at TIMESTAMPTZ,

  -- ICP Segments (was: icp_segments)
  ADD COLUMN IF NOT EXISTS icp_segments JSONB DEFAULT '[]',

  -- Blocked entities (scoped per client)
  ADD COLUMN IF NOT EXISTS blocked_entities JSONB DEFAULT '[]',

  -- Phase history log (was: client_phase_log)
  ADD COLUMN IF NOT EXISTS phase_log JSONB DEFAULT '[]',

  -- Campaign cells snapshot (per client)
  ADD COLUMN IF NOT EXISTS campaign_cells JSONB DEFAULT '[]';

-- ── 2. Constraints toevoegen ───────────────────────────────────────────────

ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS clients_gate_status_check,
  DROP CONSTRAINT IF EXISTS clients_gate_score_check;

ALTER TABLE clients
  ADD CONSTRAINT clients_gate_status_check
    CHECK (gate_status IN (
      'draft', 'synthesized', 'gate_review', 'gate_rejected',
      'gate_approved', 'client_sent', 'client_iteration', 'client_approved'
    )),
  ADD CONSTRAINT clients_gate_score_check
    CHECK (gate_score IS NULL OR (gate_score BETWEEN 0 AND 100));

-- ── 3. Data overzetten (als oude tabellen bestaan met data) ─────────────────

-- Migreer gtm_strategies naar clients.strategy JSONB
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gtm_strategies') THEN
    UPDATE clients c
    SET strategy = COALESCE(
      (SELECT to_jsonb(gs.*) - 'id' - 'client_id' - 'created_at' - 'updated_at'
       FROM gtm_strategies gs
       WHERE gs.client_id = c.id
       ORDER BY gs.created_at DESC LIMIT 1),
      '{}'
    ),
    gate_status = COALESCE(
      (SELECT gs.gate_status FROM gtm_strategies gs WHERE gs.client_id = c.id ORDER BY gs.created_at DESC LIMIT 1),
      'draft'
    ),
    gate_score =
      (SELECT gs.gate_score FROM gtm_strategies gs WHERE gs.client_id = c.id ORDER BY gs.created_at DESC LIMIT 1),
    gate_feedback =
      (SELECT gs.gate_feedback FROM gtm_strategies gs WHERE gs.client_id = c.id ORDER BY gs.created_at DESC LIMIT 1),
    gate_iterations = COALESCE(
      (SELECT gs.gate_iterations FROM gtm_strategies gs WHERE gs.client_id = c.id ORDER BY gs.created_at DESC LIMIT 1),
      0
    ),
    client_approved_at =
      (SELECT gs.client_approved_at FROM gtm_strategies gs WHERE gs.client_id = c.id ORDER BY gs.created_at DESC LIMIT 1)
    WHERE c.strategy = '{}' OR c.strategy IS NULL;
  END IF;
END $$;

-- Migreer icp_segments naar clients.icp_segments JSONB array
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'icp_segments') THEN
    UPDATE clients c
    SET icp_segments = COALESCE(
      (SELECT jsonb_agg(to_jsonb(isg.*) - 'id' - 'client_id' ORDER BY isg.created_at)
       FROM icp_segments isg
       WHERE isg.client_id = c.id),
      '[]'
    )
    WHERE c.icp_segments = '[]' OR c.icp_segments IS NULL;
  END IF;
END $$;

-- Migreer blocked_entities (client scope) naar clients.blocked_entities
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'blocked_entities') THEN
    UPDATE clients c
    SET blocked_entities = COALESCE(
      (SELECT jsonb_agg(to_jsonb(be.*) - 'id' ORDER BY be.created_at)
       FROM blocked_entities be
       WHERE be.scope_type = 'client' AND be.scope_ref = c.client_code),
      '[]'
    )
    WHERE c.blocked_entities = '[]' OR c.blocked_entities IS NULL;
  END IF;
END $$;

-- ── 4. Phase log functie aanpassen ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION log_phase_transition()
RETURNS TRIGGER AS $$
DECLARE
  log_entry JSONB;
BEGIN
  IF OLD.phase IS DISTINCT FROM NEW.phase THEN
    log_entry := jsonb_build_object(
      'from_phase', OLD.phase,
      'to_phase', NEW.phase,
      'transitioned_at', now(),
      'gate_score', NEW.gate_score,
      'blocked_by', NEW.phase_blocked_by,
      'reason', COALESCE(NEW.phase_notes, 'Automatic transition')
    );

    NEW.phase_log = COALESCE(NEW.phase_log, '[]'::jsonb) || log_entry;
    NEW.phase_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS client_phase_transition ON clients;
CREATE TRIGGER client_phase_transition
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION log_phase_transition();

-- ── 5. Oude tabellen verwijderen ────────────────────────────────────────────

DO $$
DECLARE
  strategies_count INT;
  segments_count INT;
BEGIN
  -- Check of migratie is gelukt
  SELECT COUNT(*) INTO strategies_count FROM clients
  WHERE strategy IS NOT NULL AND strategy != '{}';

  IF strategies_count > 0 THEN
    DROP TABLE IF EXISTS gtm_strategies CASCADE;
    RAISE NOTICE 'Dropped gtm_strategies (data migrated to clients.strategy)';
  END IF;

  -- Check icp_segments
  SELECT COUNT(*) INTO segments_count FROM clients
  WHERE icp_segments IS NOT NULL AND icp_segments != '[]';

  IF segments_count > 0 OR NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'icp_segments'
  ) THEN
    DROP TABLE IF EXISTS icp_segments CASCADE;
    RAISE NOTICE 'Dropped icp_segments (data migrated to clients.icp_segments)';
  END IF;

  -- Drop phase_log tabel (nu in clients.phase_log)
  DROP TABLE IF EXISTS client_phase_log CASCADE;
  RAISE NOTICE 'Dropped client_phase_log (nu in clients.phase_log)';
END $$;

-- ── 6. View aanpassen ───────────────────────────────────────────────────────

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
  EXTRACT(EPOCH FROM (now() - c.phase_updated_at)) / 3600 as hours_in_phase,
  -- Latest log entry
  (c.phase_log->-1->>'from_phase') as previous_phase,
  (c.phase_log->-1->>'transitioned_at')::timestamptz as last_transition_at,
  (c.phase_log->-1->>'reason') as last_transition_reason,
  -- Gate info
  c.gate_status,
  c.gate_score,
  -- ICP count
  jsonb_array_length(COALESCE(c.icp_segments, '[]')) as icp_segment_count,
  -- Campaign cell count
  jsonb_array_length(COALESCE(c.campaign_cells, '[]')) as cell_count,
  -- Infra status
  (
    SELECT COUNT(*) FROM email_inboxes ei
    WHERE ei.client_id = c.id AND ei.sending_status = 'active'
  ) as active_inboxes,
  -- Last meeting
  (
    SELECT m.start_time FROM meetings m
    WHERE m.client_id = c.id AND m.booking_status = 'completed'
    ORDER BY m.start_time DESC LIMIT 1
  ) as last_meeting_at
FROM clients c;

-- ── 7. Comments ─────────────────────────────────────────────────────────────

COMMENT ON COLUMN clients.strategy IS 'Volledige GTM strategy: solutions, pain_mapping, buyer_personas, entry_offers';
COMMENT ON COLUMN clients.icp_segments IS 'Array van ICP segments met aleads_config';
COMMENT ON COLUMN clients.blocked_entities IS 'Client-scoped suppression list (global suppressed zit in aparte tabel)';
COMMENT ON COLUMN clients.phase_log IS 'Historie van alle fase transities als JSONB array';
COMMENT ON COLUMN clients.campaign_cells IS 'Campaign cells voor deze client als JSONB array';
