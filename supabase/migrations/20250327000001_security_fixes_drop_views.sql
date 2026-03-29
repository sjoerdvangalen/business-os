-- ============================================
-- SECURITY FIXES: Drop ALL unused views + Enable RLS on scraper_runs
-- GTM Scaling (OS GTMS) - 2025-03-27
-- ============================================

-- Drop ALL views (not used in the application)
DROP VIEW IF EXISTS public.v_client_dashboard;
DROP VIEW IF EXISTS public.v_lead_funnel;
DROP VIEW IF EXISTS public.v_meeting_pipeline;
DROP VIEW IF EXISTS public.v_sequence_performance;
DROP VIEW IF EXISTS public.v_infrastructure_health;
DROP VIEW IF EXISTS public.v_campaign_performance;
DROP VIEW IF EXISTS public.v_inbox_health;
DROP VIEW IF EXISTS public.v_lead_pipeline;
DROP VIEW IF EXISTS public.v_sync_status;

-- Enable RLS on scraper_runs table (flagged as "RLS Disabled in Public")
ALTER TABLE public.scraper_runs ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for scraper_runs
-- Only service_role can access (standard pattern for operational tables)
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

-- Add comment for documentation
COMMENT ON TABLE public.scraper_runs IS 'Operational table - RLS enabled, service_role only access';
