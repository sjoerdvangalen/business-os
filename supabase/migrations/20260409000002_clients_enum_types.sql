-- ═══════════════════════════════════════════════════════════════
-- clients: TEXT+CHECK kolommen → proper enum types
-- Applied via management API (applied 20260409)
-- ═══════════════════════════════════════════════════════════════

-- 1. Nieuwe enum types
CREATE TYPE client_lifecycle AS ENUM (
  'onboarding','running','scaling','paused','offboarding','churned'
);
CREATE TYPE client_stage_type AS ENUM (
  'intake','internal_approval','external_approval',
  'messaging_approval','data_sourcing','h1','f1','cta1','scaling'
);
CREATE TYPE strategy_approval AS ENUM (
  'draft','synthesized',
  'internal_review','internal_approved','internal_rejected',
  'external_sent','external_iteration','external_approved'
);

-- 2. Voeg ontbrekende waarden toe aan bestaande enums
ALTER TYPE crm_type ADD VALUE IF NOT EXISTS 'gohighlevel';
ALTER TYPE crm_type ADD VALUE IF NOT EXISTS 'monday';
ALTER TYPE crm_type ADD VALUE IF NOT EXISTS 'airtable';
ALTER TYPE crm_type ADD VALUE IF NOT EXISTS 'brevo';
ALTER TYPE crm_type ADD VALUE IF NOT EXISTS 'trello';
ALTER TYPE calendar_type ADD VALUE IF NOT EXISTS 'gohighlevel';

-- 3. Drop stale trigger die fase kolom verwees
DROP TRIGGER IF EXISTS client_phase_transition ON clients;
DROP FUNCTION IF EXISTS log_phase_transition() CASCADE;

-- 4. Drop CHECK constraints (vervangen door enum constraints)
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_status_check;
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_stage_check;
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_approval_status_check;

-- 5. Normaliseer bestaande data naar lowercase enum values
UPDATE clients SET crm_type = 'hubspot'      WHERE crm_type = 'Hubspot';
UPDATE clients SET crm_type = 'gohighlevel'  WHERE crm_type = 'GoHighLevel';
UPDATE clients SET crm_type = 'monday'       WHERE crm_type = 'Monday';
UPDATE clients SET crm_type = 'airtable'     WHERE crm_type = 'Airtable';
UPDATE clients SET crm_type = 'brevo'        WHERE crm_type = 'Brevo';
UPDATE clients SET crm_type = 'trello'       WHERE crm_type = 'Trello';
UPDATE clients SET calendar_type = 'gohighlevel' WHERE calendar_type IN ('GoHighLevel','GoHighLevel Meetings');

-- 6. Converteer TEXT → enum types
ALTER TABLE clients ALTER COLUMN status DROP DEFAULT;
ALTER TABLE clients ALTER COLUMN status TYPE client_lifecycle USING status::client_lifecycle;
ALTER TABLE clients ALTER COLUMN status SET DEFAULT 'onboarding'::client_lifecycle;

ALTER TABLE clients ALTER COLUMN stage TYPE client_stage_type USING stage::client_stage_type;

ALTER TABLE clients ALTER COLUMN approval_status DROP DEFAULT;
ALTER TABLE clients ALTER COLUMN approval_status TYPE strategy_approval USING approval_status::strategy_approval;

ALTER TABLE clients ALTER COLUMN crm_type TYPE crm_type USING crm_type::crm_type;
ALTER TABLE clients ALTER COLUMN calendar_type TYPE calendar_type USING calendar_type::calendar_type;

-- 7. View met logische kolomvolgorde (Supabase Table Editor toont kolommen in aanmaaksvolgorde)
DROP VIEW IF EXISTS clients_view;
CREATE VIEW clients_view AS
SELECT
  id, name, domain,
  status, stage, approval_status,
  client_code, language, crm_type, calendar_type,
  slack_channel_id, linkedin_url, last_intake_at,
  workflow_metrics,
  onboarding_form, onboarding_form_raw, exa_research, strategy_synthesis,
  gtm_strategy_doc_url, gtm_strategy_doc_external_url, messaging_doc_url,
  dnc_entities, calendar_webhook_token,
  updated_at, created_at
FROM clients;
