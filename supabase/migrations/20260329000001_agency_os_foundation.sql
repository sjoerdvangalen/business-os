-- Agency OS Foundation
-- Adds: user roles, events, costs, alerts, tasks, daily_snapshots

-- ─────────────────────────────────────────
-- 1. USER ROLES
-- ─────────────────────────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'agency_staff'
    CHECK (role IN ('agency_admin', 'agency_staff', 'client_viewer')),
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

COMMENT ON COLUMN user_profiles.role IS 'agency_admin=full access, agency_staff=limited actions, client_viewer=own data read-only';
COMMENT ON COLUMN user_profiles.client_id IS 'Set for client_viewer — restricts RLS to this client only';

-- ─────────────────────────────────────────
-- 2. EVENTS (event stream for attribution)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id   UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  lead_id       UUID REFERENCES leads(id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL,
  metadata      JSONB NOT NULL DEFAULT '{}',
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE events IS 'Immutable event stream. event_type values: email_sent, reply_received, positive_reply, meeting_booked, meeting_completed, meeting_no_show, inbox_paused, domain_rotated, campaign_paused, campaign_resumed, lead_qualified, crm_sync_success, crm_sync_failed';

CREATE INDEX IF NOT EXISTS events_client_id_occurred_at ON events(client_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS events_campaign_id ON events(campaign_id);
CREATE INDEX IF NOT EXISTS events_event_type ON events(event_type);
CREATE INDEX IF NOT EXISTS events_occurred_at ON events(occurred_at DESC);

-- ─────────────────────────────────────────
-- 3. COSTS (margin tracking per client)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS costs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('infra', 'enrichment', 'data', 'tooling', 'labor')),
  amount_eur  DECIMAL(10, 2) NOT NULL DEFAULT 0,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS costs_client_id_date ON costs(client_id, date DESC);

-- ─────────────────────────────────────────
-- 4. ALERTS (replaces agent_memory for operational alerts)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id   UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  severity      TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  alert_type    TEXT NOT NULL,
  message       TEXT NOT NULL,
  metadata      JSONB NOT NULL DEFAULT '{}',
  resolved_at   TIMESTAMPTZ,
  resolved_by   UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE alerts IS 'alert_type values: bounce_rate_high, inbox_disconnected, volume_drop, reply_rate_drop, domain_health, crm_sync_failed, no_meeting_outcomes, client_pacing_behind, duplicate_lead_spike, domain_retirement_due';

CREATE INDEX IF NOT EXISTS alerts_client_id ON alerts(client_id);
CREATE INDEX IF NOT EXISTS alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS alerts_resolved_at ON alerts(resolved_at) WHERE resolved_at IS NULL;

-- ─────────────────────────────────────────
-- 5. TASKS (open action items per client/campaign)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id   UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'snoozed')),
  priority      TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  assigned_to   UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  due_date      DATE,
  created_by    UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_client_id_status ON tasks(client_id, status);
CREATE INDEX IF NOT EXISTS tasks_assigned_to ON tasks(assigned_to);

-- ─────────────────────────────────────────
-- 6. DAILY SNAPSHOTS (for trend charts)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_snapshots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date                  DATE NOT NULL,
  emails_sent           INT NOT NULL DEFAULT 0,
  replies               INT NOT NULL DEFAULT 0,
  positive_replies      INT NOT NULL DEFAULT 0,
  meetings_booked       INT NOT NULL DEFAULT 0,
  meetings_qualified    INT NOT NULL DEFAULT 0,
  meetings_no_show      INT NOT NULL DEFAULT 0,
  active_campaigns      INT NOT NULL DEFAULT 0,
  connected_inboxes     INT NOT NULL DEFAULT 0,
  reply_rate            DECIMAL(5, 4),
  positive_reply_rate   DECIMAL(5, 4),
  infra_cost_eur        DECIMAL(10, 2),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, date)
);

CREATE INDEX IF NOT EXISTS daily_snapshots_client_id_date ON daily_snapshots(client_id, date DESC);

-- ─────────────────────────────────────────
-- 7. UPDATED_AT TRIGGERS
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER costs_updated_at BEFORE UPDATE ON costs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────
-- 8. ROW LEVEL SECURITY
-- ─────────────────────────────────────────

-- Helper: check current user role
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid()
$$;

-- Helper: get client_id for current user (for client_viewer)
CREATE OR REPLACE FUNCTION current_user_client_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT client_id FROM user_profiles WHERE id = auth.uid()
$$;

-- EVENTS
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency staff see all events" ON events
  FOR SELECT USING (current_user_role() IN ('agency_admin', 'agency_staff'));
CREATE POLICY "client viewer sees own events" ON events
  FOR SELECT USING (
    current_user_role() = 'client_viewer'
    AND client_id = current_user_client_id()
  );
CREATE POLICY "agency admin insert events" ON events
  FOR INSERT WITH CHECK (current_user_role() IN ('agency_admin', 'agency_staff'));

-- COSTS (internal only — clients never see this)
ALTER TABLE costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency only costs" ON costs
  FOR ALL USING (current_user_role() IN ('agency_admin', 'agency_staff'));

-- ALERTS
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency staff see all alerts" ON alerts
  FOR SELECT USING (current_user_role() IN ('agency_admin', 'agency_staff'));
CREATE POLICY "agency admin manage alerts" ON alerts
  FOR ALL USING (current_user_role() = 'agency_admin');

-- TASKS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency staff see all tasks" ON tasks
  FOR SELECT USING (current_user_role() IN ('agency_admin', 'agency_staff'));
CREATE POLICY "agency admin manage tasks" ON tasks
  FOR ALL USING (current_user_role() = 'agency_admin');
CREATE POLICY "staff manage own tasks" ON tasks
  FOR UPDATE USING (
    current_user_role() = 'agency_staff'
    AND assigned_to = auth.uid()
  );

-- DAILY SNAPSHOTS
ALTER TABLE daily_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency staff see all snapshots" ON daily_snapshots
  FOR SELECT USING (current_user_role() IN ('agency_admin', 'agency_staff'));
CREATE POLICY "client viewer sees own snapshots" ON daily_snapshots
  FOR SELECT USING (
    current_user_role() = 'client_viewer'
    AND client_id = current_user_client_id()
  );
CREATE POLICY "agency admin manage snapshots" ON daily_snapshots
  FOR ALL USING (current_user_role() = 'agency_admin');
