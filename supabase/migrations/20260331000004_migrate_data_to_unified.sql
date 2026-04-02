-- ============================================
-- UNIFIED DATA MODEL - Part 4: Data Migration
-- Migrates companies → businesses, leads → contacts
-- ============================================

-- ============================================
-- Step 0: Clean up from failed migration attempts
-- ============================================

-- Truncate unified tables to start fresh (if they contain partial data)
TRUNCATE TABLE contact_campaigns, contacts, businesses CASCADE;

-- ============================================
-- Step 1: Migrate companies → businesses
-- ============================================

-- Deduplicate companies: prioritize by domain, then ensure unique linkedin_url
WITH
-- Rank companies by domain (prioritize those with domain)
ranked_by_domain AS (
    SELECT
        c.id, c.name, c.domain, c.linkedin_url, c.created_at, c.updated_at,
        ROW_NUMBER() OVER (PARTITION BY c.domain ORDER BY c.created_at DESC) as domain_rn
    FROM companies c
    WHERE c.domain IS NOT NULL
),
-- From domain-ranked, pick only those with unique linkedin_urls
by_domain_unique_linkedin AS (
    SELECT *
    FROM ranked_by_domain r1
    WHERE domain_rn = 1
      AND (linkedin_url IS NULL OR
           id = (SELECT id FROM ranked_by_domain r2
                 WHERE r2.linkedin_url = r1.linkedin_url
                   AND r2.linkedin_url IS NOT NULL
                 ORDER BY r2.created_at DESC
                 LIMIT 1))
),
-- Get companies with linkedin but no domain
linkedin_no_domain AS (
    SELECT
        c.id, c.name, c.domain, c.linkedin_url, c.created_at, c.updated_at,
        ROW_NUMBER() OVER (PARTITION BY c.linkedin_url ORDER BY c.created_at DESC) as linkedin_rn
    FROM companies c
    WHERE c.linkedin_url IS NOT NULL
      AND c.domain IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM by_domain_unique_linkedin bd
          WHERE bd.linkedin_url = c.linkedin_url
      )
),
-- Final deduplicated set
final_dedup AS (
    SELECT id, name, domain, linkedin_url, created_at, updated_at
    FROM by_domain_unique_linkedin
    UNION ALL
    SELECT id, name, domain, linkedin_url, created_at, updated_at
    FROM linkedin_no_domain
    WHERE linkedin_rn = 1
)
INSERT INTO businesses (
    id, name, domain, linkedin_url, source, first_seen_at,
    times_targeted, enrichment_data, created_at, updated_at
)
SELECT
    gen_random_uuid(),
    COALESCE(name, 'Unknown'),
    domain,
    linkedin_url,
    'gmaps_scraper',
    COALESCE(created_at, now()),
    1,
    '{}'::jsonb,
    COALESCE(created_at, now()),
    COALESCE(updated_at, now())
FROM final_dedup;

-- ============================================
-- Step 2: Create mapping and migrate leads → contacts
-- ============================================

-- Create mapping table for company_id → business_id
DROP TABLE IF EXISTS company_business_mapping;
CREATE TEMP TABLE company_business_mapping AS
SELECT DISTINCT ON (c.id)
    c.id as company_id,
    b.id as business_id
FROM companies c
JOIN businesses b ON b.domain = c.domain
ORDER BY c.id, b.created_at DESC;

-- Migrate leads to contacts (only if not already migrated)
-- Use CTE to deduplicate leads by email before inserting
WITH deduped_leads AS (
    SELECT DISTINCT ON (l.email)
        l.id,
        cbm.business_id,
        l.first_name,
        l.last_name,
        l.email,
        l.client_id,
        l.lead_status,
        l.created_at,
        l.updated_at,
        l.replied_count,
        l.plusvibe_lead_id
    FROM leads l
    LEFT JOIN company_business_mapping cbm ON l.company_id = cbm.company_id
    WHERE cbm.business_id IS NOT NULL
      AND l.email IS NOT NULL
    ORDER BY l.email, l.created_at DESC
)
INSERT INTO contacts (
    id,
    business_id,
    first_name,
    last_name,
    email,
    client_id,
    contact_status,
    times_targeted,
    last_targeted_at,
    reply_count,
    meetings_booked_count,
    source,
    source_id,
    enrichment_data,
    available_for_reuse_after,
    reuse_cooldown_days,
    created_at,
    updated_at
)
SELECT
    id,
    business_id,
    first_name,
    last_name,
    email,
    client_id,
    CASE
        WHEN lead_status = 'new' THEN 'new'::text
        WHEN lead_status = 'contacted' THEN 'targeted'::text
        WHEN lead_status = 'replied' THEN 'responded'::text
        WHEN lead_status = 'interested' THEN 'responded'::text
        WHEN lead_status = 'meeting_booked' THEN 'meeting_booked'::text
        WHEN lead_status = 'not_interested' THEN 'not_interested'::text
        WHEN lead_status = 'blocklisted' THEN 'do_not_contact'::text
        WHEN lead_status = 'completed' THEN 'qualified'::text
        WHEN lead_status = 'unsubscribed' THEN 'unsubscribed'::text
        ELSE COALESCE(lead_status, 'new')::text
    END as contact_status,
    1 as times_targeted,
    created_at as last_targeted_at,
    COALESCE(replied_count, 0) as reply_count,
    0 as meetings_booked_count,
    'plusvibe' as source,
    plusvibe_lead_id as source_id,
    '{}'::jsonb as enrichment_data,
    CASE
        WHEN lead_status IN ('qualified', 'completed') THEN updated_at + INTERVAL '90 days'
        WHEN lead_status IN ('not_interested') THEN updated_at + INTERVAL '180 days'
        WHEN lead_status IN ('blocklisted', 'unsubscribed') THEN NULL
        ELSE updated_at + INTERVAL '90 days'
    END as available_for_reuse_after,
    90 as reuse_cooldown_days,
    COALESCE(created_at, now()),
    COALESCE(updated_at, now())
FROM deduped_leads
WHERE NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = deduped_leads.id);

-- ============================================
-- Step 3: Create contact_campaigns links
-- ============================================

INSERT INTO contact_campaigns (
    contact_id,
    campaign_id,
    client_id,
    campaign_status,
    plusvibe_lead_id,
    added_at,
    first_sent_at
)
SELECT
    l.id as contact_id,
    l.campaign_id,
    l.client_id,
    CASE
        WHEN l.lead_status = 'new' THEN 'added'::text
        WHEN l.lead_status IN ('contacted', 'replied', 'interested') THEN 'sent'::text
        WHEN l.lead_status = 'meeting_booked' THEN 'meeting_booked'::text
        WHEN l.lead_status IN ('not_interested', 'completed', 'blocklisted') THEN 'completed'::text
        WHEN l.lead_status = 'unsubscribed' THEN 'unsubscribed'::text
        ELSE 'added'::text
    END as campaign_status,
    l.plusvibe_lead_id,
    l.created_at as added_at,
    CASE WHEN l.lead_status IN ('contacted', 'replied', 'interested', 'meeting_booked') THEN l.created_at END as first_sent_at
FROM leads l
WHERE l.campaign_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM contacts c WHERE c.id = l.id)
  AND NOT EXISTS (
    SELECT 1 FROM contact_campaigns cc
    WHERE cc.contact_id = l.id AND cc.campaign_id = l.campaign_id
  );

-- ============================================
-- Step 4: Update aggregated counts
-- ============================================

-- Update businesses.times_targeted from contact campaigns
UPDATE businesses b
SET times_targeted = sub.target_count
FROM (
    SELECT
        c.business_id,
        COUNT(DISTINCT cc.campaign_id) as target_count
    FROM contacts c
    JOIN contact_campaigns cc ON cc.contact_id = c.id
    GROUP BY c.business_id
) sub
WHERE b.id = sub.business_id;

-- Cleanup
DROP TABLE IF EXISTS company_business_mapping;

-- ============================================
-- Migration Statistics
-- ============================================

DO $$
DECLARE
    business_count INT;
    contact_count INT;
    campaign_link_count INT;
BEGIN
    SELECT COUNT(*) INTO business_count FROM businesses;
    SELECT COUNT(*) INTO contact_count FROM contacts;
    SELECT COUNT(*) INTO campaign_link_count FROM contact_campaigns;

    RAISE NOTICE 'Migration complete:';
    RAISE NOTICE '  Businesses: %', business_count;
    RAISE NOTICE '  Contacts: %', contact_count;
    RAISE NOTICE '  Campaign links: %', campaign_link_count;
END $$;
