-- ============================================
-- Drop unused tables: tasks and events
-- These were scaffolding that was never implemented
-- ============================================

DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS events CASCADE;

COMMENT ON TABLE sync_log IS 'Sync operation logs from all edge functions';
COMMENT ON TABLE email_cache IS 'Cached email lookups from email-waterfall';
COMMENT ON TABLE mx_cache IS 'Cached MX record lookups for email verification';
COMMENT ON TABLE user_profiles IS 'User roles and client associations for dashboard auth';
