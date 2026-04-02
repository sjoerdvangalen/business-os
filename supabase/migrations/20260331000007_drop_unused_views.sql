-- ============================================
-- Drop unused views and functions - lean setup
-- These are over-engineered and not used anywhere
-- ============================================

DROP VIEW IF EXISTS contacts_available_for_reuse CASCADE;
DROP VIEW IF EXISTS campaign_contact_summary CASCADE;
DROP VIEW IF EXISTS contact_details CASCADE;

DROP FUNCTION IF EXISTS get_contacts_for_campaign(UUID, INT, UUID) CASCADE;
