-- ═══════════════════════════════════════════════════════════════════════
-- GTM Pipeline Definitief Model v3
-- status lifecycle | stage | approval_status | dnc_entities
-- ═══════════════════════════════════════════════════════════════════════

-- Drop stale views before column drops (avoid dependency errors)
DROP VIEW IF EXISTS client_overview CASCADE;

-- ── 1. status: ENUM → TEXT met nieuwe lifecycle waarden ─────────────────
ALTER TABLE clients ALTER COLUMN status DROP DEFAULT;
ALTER TABLE clients ALTER COLUMN status TYPE TEXT USING status::TEXT;

UPDATE clients SET status = 'onboarding' WHERE status = 'active';
UPDATE clients SET status = 'churned'    WHERE status = 'archived';
-- 'paused' blijft 'paused'

ALTER TABLE clients ADD CONSTRAINT clients_status_check
  CHECK (status IN ('onboarding','running','scaling','paused','offboarding','churned'));

ALTER TABLE clients ALTER COLUMN status SET DEFAULT 'onboarding';

COMMENT ON COLUMN clients.status IS
  'Lifecycle: onboarding|running|scaling|paused|offboarding|churned. Default: onboarding.
   running pas zetten bij daadwerkelijke H1 launch (gtm-campaign-push bij PlusVibe launch).';

-- ── 2. stage toevoegen ───────────────────────────────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS stage TEXT
  CHECK (stage IN (
    'intake','internal_approval','external_approval',
    'messaging_approval','data_sourcing','h1','f1','cta1','scaling'
  ));

COMMENT ON COLUMN clients.stage IS
  'Primaire werkfase operator. Wordt gezet door de startende functie, NOOIT door de approvende functie.
   Eigendomsregel: intake=webhook-jotform-intake, internal_approval=gtm-doc-render(internal),
   external_approval=gtm-doc-render(external), messaging_approval=gtm-messaging-doc,
   data_sourcing=gtm-aleads-source, h1=gtm-campaign-push(bij launch).';

-- ── 3. gate_status → approval_status (defensief: IF EXISTS) ─────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='clients' AND column_name='gate_status'
  ) THEN
    ALTER TABLE clients RENAME COLUMN gate_status TO approval_status;
  END IF;
END $$;

-- Drop oude constraint (ook als gate_status al approval_status heette)
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_gate_status_check;
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_approval_status_check;

-- Constraint alleen toevoegen als kolom bestaat
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='clients' AND column_name='approval_status'
  ) THEN
    ALTER TABLE clients ADD CONSTRAINT clients_approval_status_check
      CHECK (approval_status IN (
        'draft','synthesized',
        'internal_review','internal_approved','internal_rejected',
        'external_sent','external_iteration','external_approved'
      ));
  END IF;
END $$;

-- Comment conditioneel
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='clients' AND column_name='approval_status'
  ) THEN
    COMMENT ON COLUMN clients.approval_status IS
      'Strategy approval state machine ONLY. Messaging/sourcing/infra approvals zitten in workflow_metrics.
       Flow: draft→synthesized→internal_review→internal_approved|internal_rejected
             →external_sent→external_iteration|external_approved';
  END IF;
END $$;

-- ── 4. stage backfill ────────────────────────────────────────────────────
UPDATE clients SET stage = 'intake'
  WHERE approval_status IN ('draft','synthesized') AND stage IS NULL;
UPDATE clients SET stage = 'internal_approval'
  WHERE approval_status IN ('internal_review','internal_approved','internal_rejected') AND stage IS NULL;
-- external_approved klanten staan bewust op external_approval — handmatig bijstellen na deploy
UPDATE clients SET stage = 'external_approval'
  WHERE approval_status IN ('external_sent','external_iteration','external_approved') AND stage IS NULL;

-- ── 5. blocked_entities → dnc_entities (defensief: IF EXISTS) ────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='clients' AND column_name='blocked_entities'
  ) THEN
    ALTER TABLE clients RENAME COLUMN blocked_entities TO dnc_entities;
  END IF;
END $$;

-- Zorg dat dnc_entities altijd bestaat (ook als blocked_entities niet bestond)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS dnc_entities JSONB DEFAULT '{"domains":[],"emails":[]}';

COMMENT ON COLUMN clients.dnc_entities IS
  'Do-not-contact MVP: {domains:[], emails:[]}. Geen audit trail (bewust simpel, uitbreidbaar later).';

-- ── 6. workflow_metrics base shape backfill ──────────────────────────────
-- Bestaande rows krijgen de basisshape. Bestaande waarden blijven bewaard via COALESCE.
UPDATE clients
SET workflow_metrics = COALESCE(workflow_metrics, '{}') ||
  jsonb_build_object(
    'intake',            COALESCE(workflow_metrics->'intake',            '{"status":"completed","attempts":1,"started_at":null,"decided_at":null,"duration_seconds":null}'::jsonb),
    'internal_approval', COALESCE(workflow_metrics->'internal_approval', '{"status":"pending","attempts":0,"started_at":null,"decided_at":null,"duration_seconds":null,"last_feedback":null,"score":null}'::jsonb),
    'external_approval', COALESCE(workflow_metrics->'external_approval', '{"status":"pending","attempts":0,"started_at":null,"decided_at":null,"duration_seconds":null,"last_feedback":null}'::jsonb),
    'messaging_approval',COALESCE(workflow_metrics->'messaging_approval','{"status":"pending","attempts":0,"started_at":null,"decided_at":null,"duration_seconds":null,"last_feedback":null}'::jsonb),
    'sourcing_review',   COALESCE(workflow_metrics->'sourcing_review',   '{"status":"not_started","attempts":0,"started_at":null,"decided_at":null,"duration_seconds":null,"last_feedback":null}'::jsonb),
    'infra',             COALESCE(workflow_metrics->'infra',             '{"status":"not_started","last_feedback":null,"updated_at":null}'::jsonb),
    'totals',            COALESCE(workflow_metrics->'totals',            '{"pipeline_started_at":null,"days_to_first_live_test":null}'::jsonb)
  )
WHERE workflow_metrics IS NULL
   OR NOT (workflow_metrics ? 'infra');

-- ── 7. Drop stale kolommen ───────────────────────────────────────────────
ALTER TABLE clients
  DROP COLUMN IF EXISTS pipeline_status,
  DROP COLUMN IF EXISTS intake_status,
  DROP COLUMN IF EXISTS phase,
  DROP COLUMN IF EXISTS phase_updated_at,
  DROP COLUMN IF EXISTS phase_blocked_by,
  DROP COLUMN IF EXISTS phase_blocked_at,
  DROP COLUMN IF EXISTS phase_notes,
  DROP COLUMN IF EXISTS phase_log,
  DROP COLUMN IF EXISTS gate_score,
  DROP COLUMN IF EXISTS gate_feedback,
  DROP COLUMN IF EXISTS gate_iterations,
  DROP COLUMN IF EXISTS client_approved_at;

-- ── 8. Deprecated readonly kolommen: bewaren + commentaar (defensief) ────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='icp_segments') THEN
    COMMENT ON COLUMN clients.icp_segments IS
      'DEPRECATED_READONLY: nu in strategy_synthesis. Niet meer schrijven. Drop in aparte cleanup migration.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='campaign_cells') THEN
    COMMENT ON COLUMN clients.campaign_cells IS
      'DEPRECATED_READONLY: nu in campaign_cells tabel. Niet meer schrijven. Drop in aparte cleanup migration.';
  END IF;
END $$;
