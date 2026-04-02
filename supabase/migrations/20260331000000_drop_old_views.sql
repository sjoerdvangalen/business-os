-- ============================================
-- UNIFIED DATA MODEL - Part 0: Drop Old Views
-- Drops views that reference old contacts table schema
-- Must run BEFORE creating new unified contacts table
-- ============================================

-- Drop views that reference old contacts schema
DROP VIEW IF EXISTS v_client_dashboard CASCADE;
DROP VIEW IF EXISTS v_meeting_pipeline CASCADE;
DROP VIEW IF EXISTS v_lead_funnel CASCADE;
DROP VIEW IF EXISTS v_infrastructure_health CASCADE;
DROP VIEW IF EXISTS v_sequence_performance CASCADE;

-- Drop old scaffolding contacts table and its dependencies
DROP TABLE IF EXISTS contacts CASCADE;
