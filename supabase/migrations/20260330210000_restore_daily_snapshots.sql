-- Restore daily_snapshots table for trend charts
-- This table was accidentally dropped in cleanup, needed by populate-daily-kpis

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

-- Add RLS
ALTER TABLE daily_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency staff see all snapshots" ON daily_snapshots
  FOR SELECT USING (current_user_role() IN ('agency_admin', 'agency_staff'));

CREATE POLICY "client viewer sees own snapshots" ON daily_snapshots
  FOR SELECT USING (
    current_user_role() = 'client_viewer'
    AND client_id = current_user_client_id()
  );

COMMENT ON TABLE daily_snapshots IS 'Daily KPI aggregation for trend charts';
