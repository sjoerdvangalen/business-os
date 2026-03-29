-- ============================================
-- COMPREHENSIVE SECURITY & PERFORMANCE FIXES
-- GTM Scaling (OS GTMS) - 2025-03-27
-- ============================================

-- ============================================
-- SECTION 1: DROP ALL VIEWS (CRITICAL SECURITY)
-- ============================================
DROP VIEW IF EXISTS public.v_client_dashboard CASCADE;
DROP VIEW IF EXISTS public.v_lead_funnel CASCADE;
DROP VIEW IF EXISTS public.v_meeting_pipeline CASCADE;
DROP VIEW IF EXISTS public.v_sequence_performance CASCADE;
DROP VIEW IF EXISTS public.v_infrastructure_health CASCADE;
DROP VIEW IF EXISTS public.v_campaign_performance CASCADE;
DROP VIEW IF EXISTS public.v_inbox_health CASCADE;
DROP VIEW IF EXISTS public.v_lead_pipeline CASCADE;
DROP VIEW IF EXISTS public.v_sync_status CASCADE;

-- ============================================
-- SECTION 2: ENABLE RLS ON scraper_runs
-- ============================================
ALTER TABLE IF EXISTS public.scraper_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'scraper_runs'
        AND policyname = 'Service role full access'
    ) THEN
        CREATE POLICY "Service role full access" ON public.scraper_runs
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END
$$;

-- ============================================
-- SECTION 3: FIX FUNCTION SEARCH PATHS
-- ============================================
DO $$
DECLARE
    func_record RECORD;
    func_signature TEXT;
BEGIN
    -- Loop through all functions in public schema that match our list
    FOR func_record IN
        SELECT
            p.proname as func_name,
            pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
        AND p.proname IN (
            'update_campaign_plans_updated_at',
            'get_email_reply_data',
            'update_updated_at_column',
            'update_updated_at',
            'update_client_integrations_timestamp',
            'has_client_access',
            'update_onboarding_timestamp'
        )
    LOOP
        -- Build the function signature
        IF func_record.args IS NOT NULL AND func_record.args <> '' THEN
            func_signature := format('%I(%s)', func_record.func_name, func_record.args);
        ELSE
            func_signature := format('%I()', func_record.func_name);
        END IF;

        -- Execute the ALTER FUNCTION with the correct signature
        EXECUTE format('ALTER FUNCTION public.%s SET search_path = public', func_signature);
        RAISE NOTICE 'Fixed search_path for function: %', func_signature;
    END LOOP;
END
$$;

-- ============================================
-- SECTION 4: FIX DUPLICATE INDEXES (drop duplicates)
-- ============================================
-- campaigns: campaigns_client_id_idx (keep idx_campaigns_client)
DROP INDEX IF EXISTS public.campaigns_client_id_idx;
-- campaigns: campaigns_external_id_idx (keep idx_campaigns_external_id)
DROP INDEX IF EXISTS public.campaigns_external_id_idx;
-- companies: accounts_client_id_idx (keep idx_companies_client)
DROP INDEX IF EXISTS public.accounts_client_id_idx;
-- leads: contacts_client_id_idx (keep idx_leads_client)
DROP INDEX IF EXISTS public.contacts_client_id_idx;
-- leads: contacts_account_id_idx (keep idx_leads_company)
DROP INDEX IF EXISTS public.contacts_account_id_idx;
-- meetings: meetings_opportunity_id_idx (keep idx_meetings_opportunity)
DROP INDEX IF EXISTS public.meetings_opportunity_id_idx;
-- opportunities: opportunities_client_id_idx (keep idx_opportunities_client)
DROP INDEX IF EXISTS public.opportunities_client_id_idx;

-- ============================================
-- SECTION 5: ADD MISSING INDEXES ON FOREIGN KEYS
-- ============================================
-- campaign_cells FKs
CREATE INDEX IF NOT EXISTS idx_campaign_cells_entry_offer ON public.campaign_cells(entry_offer_id);
CREATE INDEX IF NOT EXISTS idx_campaign_cells_primary_persona ON public.campaign_cells(primary_persona_id);
CREATE INDEX IF NOT EXISTS idx_campaign_cells_proof_asset ON public.campaign_cells(proof_asset_id);
CREATE INDEX IF NOT EXISTS idx_campaign_cells_segment ON public.campaign_cells(segment_id);

-- contacts FKs
CREATE INDEX IF NOT EXISTS idx_contacts_company ON public.contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_contacts_lead_source ON public.contacts(lead_source_id);
CREATE INDEX IF NOT EXISTS idx_contacts_source_campaign ON public.contacts(source_campaign_id);

-- email_inboxes FK
CREATE INDEX IF NOT EXISTS idx_email_inboxes_domain ON public.email_inboxes(domain_id);

-- email_threads FK
CREATE INDEX IF NOT EXISTS idx_email_threads_campaign ON public.email_threads(campaign_id);

-- webhook_logs FK
CREATE INDEX IF NOT EXISTS idx_webhook_logs_contact ON public.webhook_logs(contact_id);

-- scraping_csv_exports FK
CREATE INDEX IF NOT EXISTS idx_scraping_csv_exports_run ON public.scraping_csv_exports(run_id);

-- ============================================
-- SECTION 6: DROP UNUSED INDEXES (cleanup)
-- ============================================
-- These indexes have 0 scans and can be removed
DROP INDEX IF EXISTS public.idx_scraper_runs_status;
DROP INDEX IF EXISTS public.idx_scraper_runs_started_at;
DROP INDEX IF EXISTS public.campaign_runs_campaign_cell_id_idx;
DROP INDEX IF EXISTS public.campaign_runs_test_phase_idx;
DROP INDEX IF EXISTS public.campaign_runs_plusvibe_campaign_id_idx;
DROP INDEX IF EXISTS public.campaign_runs_status_idx;
DROP INDEX IF EXISTS public.campaign_variants_campaign_run_id_idx;
DROP INDEX IF EXISTS public.campaign_variants_variant_type_idx;
DROP INDEX IF EXISTS public.campaign_variants_is_winner_idx;
DROP INDEX IF EXISTS public.idx_companies_status;
DROP INDEX IF EXISTS public.idx_companies_zip;
DROP INDEX IF EXISTS public.idx_companies_scraper_job;
DROP INDEX IF EXISTS public.idx_email_cache_slug;
DROP INDEX IF EXISTS public.idx_webhook_logs_source;
DROP INDEX IF EXISTS public.idx_user_profiles_user;
DROP INDEX IF EXISTS public.idx_user_profiles_client;
DROP INDEX IF EXISTS public.campaign_metrics_campaign_cell_id_idx;
DROP INDEX IF EXISTS public.campaign_metrics_snapshot_date_idx;
DROP INDEX IF EXISTS public.campaign_metrics_campaign_run_id_idx;
DROP INDEX IF EXISTS public.idx_email_threads_inbox;
DROP INDEX IF EXISTS public.idx_email_threads_last_email;
DROP INDEX IF EXISTS public.idx_email_inboxes_email;
DROP INDEX IF EXISTS public.accounts_domain_idx;
DROP INDEX IF EXISTS public.contacts_client_id_idx;
DROP INDEX IF EXISTS public.contacts_account_id_idx;
DROP INDEX IF EXISTS public.idx_csv_exports_batch;
DROP INDEX IF EXISTS public.idx_csv_exports_client;
DROP INDEX IF EXISTS public.opportunities_client_id_idx;
DROP INDEX IF EXISTS public.opportunities_stage_idx;
DROP INDEX IF EXISTS public.campaigns_client_id_idx;
DROP INDEX IF EXISTS public.campaigns_external_id_idx;
DROP INDEX IF EXISTS public.meetings_client_id_idx;
DROP INDEX IF EXISTS public.meetings_contact_id_idx;
DROP INDEX IF EXISTS public.domains_client_id_idx;
DROP INDEX IF EXISTS public.idx_campaigns_external_id;
DROP INDEX IF EXISTS public.idx_contacts_plusvibe_lead_id;
DROP INDEX IF EXISTS public.campaign_metrics_plusvibe_campaign_id_idx;
DROP INDEX IF EXISTS public.idx_client_integrations_client;
DROP INDEX IF EXISTS public.idx_client_integrations_type;
DROP INDEX IF EXISTS public.idx_meetings_integration;
DROP INDEX IF EXISTS public.idx_clients_status;
DROP INDEX IF EXISTS public.idx_opportunities_campaign;
DROP INDEX IF EXISTS public.idx_opportunities_client;
DROP INDEX IF EXISTS public.idx_meetings_opportunity;
DROP INDEX IF EXISTS public.gtm_strategies_client_id_idx;
DROP INDEX IF EXISTS public.gtm_strategies_status_idx;
DROP INDEX IF EXISTS public.solutions_gtm_strategy_id_idx;
DROP INDEX IF EXISTS public.idx_meetings_review_pending;
DROP INDEX IF EXISTS public.entry_offers_gtm_strategy_id_idx;
DROP INDEX IF EXISTS public.icp_segments_gtm_strategy_id_idx;
DROP INDEX IF EXISTS public.entry_offers_solution_id_idx;
DROP INDEX IF EXISTS public.buyer_personas_gtm_strategy_id_idx;
DROP INDEX IF EXISTS public.proof_assets_gtm_strategy_id_idx;
DROP INDEX IF EXISTS public.proof_assets_solution_id_idx;
DROP INDEX IF EXISTS public.idx_leads_client;
DROP INDEX IF EXISTS public.idx_leads_campaign;
DROP INDEX IF EXISTS public.idx_leads_company;
DROP INDEX IF EXISTS public.idx_companies_client;
DROP INDEX IF EXISTS public.idx_companies_name;
DROP INDEX IF EXISTS public.idx_email_threads_lead;
DROP INDEX IF EXISTS public.idx_contacts_client;
DROP INDEX IF EXISTS public.idx_contacts_lead;
DROP INDEX IF EXISTS public.idx_contacts_status;
DROP INDEX IF EXISTS public.idx_lead_pool_linkedin;
DROP INDEX IF EXISTS public.idx_lead_pool_domain;
DROP INDEX IF EXISTS public.idx_lead_pool_status;
DROP INDEX IF EXISTS public.idx_email_cache_linkedin;
DROP INDEX IF EXISTS public.idx_email_cache_domain;
DROP INDEX IF EXISTS public.idx_campaign_plans_status;
DROP INDEX IF EXISTS public.idx_campaign_plans_client;
DROP INDEX IF EXISTS public.campaign_cells_gtm_strategy_id_idx;
DROP INDEX IF EXISTS public.campaign_cells_client_id_idx;
DROP INDEX IF EXISTS public.campaign_cells_solution_id_idx;
DROP INDEX IF EXISTS public.campaign_cells_status_idx;
DROP INDEX IF EXISTS public.campaign_cells_priority_score_idx;
DROP INDEX IF EXISTS public.idx_clients_code;

-- ============================================
-- SECTION 7: ADD RLS POLICIES TO TABLES WITHOUT POLICIES
-- ============================================
-- These tables have RLS enabled but no policies
-- Adding restrictive policy for service_role only

DO $$
DECLARE
    tables_to_fix TEXT[] := ARRAY[
        'agent_memory', 'buyer_personas', 'campaign_cells', 'campaign_metrics',
        'campaign_plans', 'campaign_runs', 'campaign_variants', 'client_integrations',
        'contacts', 'email_inboxes', 'email_sequences', 'email_threads',
        'entry_offers', 'gtm_strategies', 'icp_segments', 'lead_pool',
        'mx_cache', 'proof_assets', 'solutions', 'sync_log', 'webhook_logs'
    ];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY tables_to_fix
    LOOP
        -- Check if table exists and has RLS enabled but no policies
        IF EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
            AND c.relname = t
            AND c.relrowsecurity = true
        ) AND NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE tablename = t
        ) THEN
            EXECUTE format(
                'CREATE POLICY "Service role full access" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
                t
            );
        END IF;
    END LOOP;
END
$$;

-- ============================================
-- SECTION 8: ADD COMMENTS
-- ============================================
COMMENT ON TABLE public.scraper_runs IS 'Operational table - RLS enabled, service_role only access';
