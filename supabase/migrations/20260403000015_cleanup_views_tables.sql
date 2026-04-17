-- ═══════════════════════════════════════════════════════════════════════════
-- Cleanup: Drop unnecessary views and tables
-- Verwijdert daily snapshots, blocked_entities tabel, client_pipeline_status view
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Drop views ───────────────────────────────────────────────────────────

DROP VIEW IF EXISTS client_pipeline_status CASCADE;
DROP VIEW IF EXISTS v_client_dashboard CASCADE;
DROP VIEW IF EXISTS v_campaign_health CASCADE;
DROP VIEW IF EXISTS v_daily_metrics CASCADE;

-- ── 2. Drop daily snapshots tabel ───────────────────────────────────────────

DROP TABLE IF EXISTS daily_snapshots CASCADE;

-- ── 3. Drop blocked_entities tabel (global suppression → clients.blocked_entities) ─

-- Eerst global entities migreren naar clients die ze nodig hebben
DO $$
DECLARE
  global_blocked JSONB;
BEGIN
  -- Check of tabel bestaat
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'blocked_entities') THEN
    -- Haal global blocked entities op
    SELECT jsonb_agg(
      jsonb_build_object(
        'entity_type', entity_type,
        'entity_value', entity_value,
        'reason', reason,
        'blocked_by', blocked_by,
        'blocked_at', created_at
      )
    ) INTO global_blocked
    FROM blocked_entities
    WHERE scope_type = 'global';

    -- Voeg toe aan alle clients als er global blocks zijn
    IF global_blocked IS NOT NULL AND jsonb_array_length(global_blocked) > 0 THEN
      UPDATE clients
      SET blocked_entities = COALESCE(blocked_entities, '[]'::jsonb) || global_blocked;

      RAISE NOTICE 'Migrated % global blocked entities to all clients', jsonb_array_length(global_blocked);
    END IF;

    -- Drop de tabel
    DROP TABLE IF EXISTS blocked_entities CASCADE;
    RAISE NOTICE 'Dropped blocked_entities table';
  END IF;
END $$;

-- ── 4. Drop client_phase_log tabel (nu in clients.phase_log) ────────────────

DROP TABLE IF EXISTS client_phase_log CASCADE;

-- ── 5. Drop eventuele overgebleven GTM tabellen ─────────────────────────────

DROP TABLE IF EXISTS gtm_strategies CASCADE;
DROP TABLE IF EXISTS icp_segments CASCADE;
DROP TABLE IF EXISTS campaign_plans CASCADE;
DROP TABLE IF EXISTS campaign_runs CASCADE;
DROP TABLE IF EXISTS campaign_variants CASCADE;

-- ── 6. Drop obsolete functions ──────────────────────────────────────────────

DROP FUNCTION IF EXISTS auto_flag_review() CASCADE;

-- ── 7. Simpele client status view (alleen essentials) ───────────────────────

DROP VIEW IF EXISTS client_overview CASCADE;

CREATE VIEW client_overview AS
SELECT
  c.id,
  c.client_code,
  c.name,
  c.phase,
  c.phase_updated_at,
  c.phase_blocked_by,
  c.gate_status,
  c.gate_score,
  jsonb_array_length(COALESCE(c.icp_segments, '[]')) as icp_count,
  jsonb_array_length(COALESCE(c.campaign_cells, '[]')) as cell_count,
  (
    SELECT COUNT(*) FROM email_inboxes ei
    WHERE ei.client_id = c.id AND ei.sending_status = 'active'
  ) as active_inboxes
FROM clients c;
