-- daily_kpis → kpis
ALTER TABLE daily_kpis RENAME TO kpis;
DROP INDEX IF EXISTS idx_daily_kpis_client;
DROP INDEX IF EXISTS idx_daily_kpis_date;
CREATE INDEX IF NOT EXISTS idx_kpis_client ON kpis(client_id);
CREATE INDEX IF NOT EXISTS idx_kpis_date ON kpis(date);

-- Drop empty legacy inboxes table
DROP TABLE IF EXISTS inboxes CASCADE;
