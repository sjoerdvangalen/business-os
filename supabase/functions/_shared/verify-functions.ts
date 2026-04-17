import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

export async function verifyFunctions() {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // List of functions that SHOULD be active (based on codebase)
  const expectedActive = [
    // PlusVibe Sync
    'sync-plusvibe-campaigns',
    'sync-plusvibe-accounts',
    'sync-plusvibe-leads',
    'sync-plusvibe-warmup',
    'sync-sequences',
    // EmailBison Sync
    'sync-emailbison-campaigns',
    'sync-emailbison-accounts',
    'sync-emailbison-sequences',
    // Webhooks
    'webhook-receiver',
    'webhook-meeting',
    'webhook-slack-interaction',
    'webhook-emailbison',
    // Processing
    'meeting-review',
    'populate-daily-kpis',
    'campaign-monitor',
    'domain-monitor',
    'sync-domains',
    // Lead Gen
    'process-gmaps-batch',
    'email-waterfall',
    'find-contacts',
    'ai-enrich-contact'
  ]

  // List of functions that should be ARCHIVED
  const expectedArchived = [
    'aggregate-kpis',
    'analyze-attribution',
    'analyze-icp',
    'detect-anomalies',
    'gtm-crud-cells',
    'gtm-crud-personas',
    'gtm-crud-runs',
    'gtm-crud-segments',
    'gtm-crud-solutions',
    'gtm-crud-strategies',
    'gtm-crud-variants',
    'lead-router',
    'setup-cron-jobs',
    'webhook-calendar',
    'webhook-debug'
  ]

  // Try to invoke each function to verify it exists
  const results = {
    active: { exists: [] as string[], missing: [] as string[], errors: [] as any[] },
    archived: { exists: [] as string[], missing: [] as string[], errors: [] as any[] }
  }

  // Check active functions
  for (const fn of expectedActive) {
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body: { check: true } })
      if (error && error.message?.includes('not found')) {
        results.active.missing.push(fn)
      } else {
        results.active.exists.push(fn)
      }
    } catch (e: any) {
      if (e.message?.includes('not found') || e.message?.includes('404')) {
        results.active.missing.push(fn)
      } else {
        // Function exists but returned error (which is fine for our check)
        results.active.exists.push(fn)
      }
    }
  }

  // Check archived functions (should NOT exist)
  for (const fn of expectedArchived) {
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body: { check: true } })
      if (error && error.message?.includes('not found')) {
        results.archived.missing.push(fn) // Good - should not exist
      } else {
        results.archived.exists.push(fn) // Bad - still exists
      }
    } catch (e: any) {
      if (e.message?.includes('not found') || e.message?.includes('404')) {
        results.archived.missing.push(fn) // Good - properly archived
      } else {
        results.archived.errors.push({ fn, error: e.message })
      }
    }
  }

  return {
    summary: {
      active_deployed: results.active.exists.length,
      active_missing: results.active.missing.length,
      archived_properly: results.archived.missing.length,
      archived_still_deployed: results.archived.exists.length
    },
    details: results
  }
}
