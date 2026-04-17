import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // List of functions that SHOULD be active
  const expectedActive = [
    'sync-plusvibe-campaigns', 'sync-plusvibe-accounts', 'sync-plusvibe-leads',
    'sync-plusvibe-warmup', 'sync-sequences',
    'sync-emailbison-campaigns', 'sync-emailbison-accounts', 'sync-emailbison-sequences',
    'webhook-receiver', 'webhook-meeting', 'webhook-slack-interaction', 'webhook-emailbison',
    'meeting-review', 'populate-daily-kpis', 'campaign-monitor', 'domain-monitor', 'sync-domains',
    'process-gmaps-batch', 'email-waterfall', 'find-contacts', 'ai-enrich-contact'
  ]

  // List of functions that should be ARCHIVED
  const expectedArchived = [
    'aggregate-kpis', 'analyze-attribution', 'analyze-icp', 'detect-anomalies',
    'gtm-crud-cells', 'gtm-crud-personas', 'gtm-crud-runs', 'gtm-crud-segments',
    'gtm-crud-solutions', 'gtm-crud-strategies', 'gtm-crud-variants',
    'lead-router', 'setup-cron-jobs', 'webhook-calendar', 'webhook-debug'
  ]

  const results: any = {
    timestamp: new Date().toISOString(),
    active: { confirmed: [], missing: [] },
    archived: { confirmed: [], still_deployed: [] }
  }

  // Check all functions
  const allFunctions = [...expectedActive, ...expectedArchived]

  for (const fn of allFunctions) {
    try {
      // Try to invoke function with a simple GET
      const response = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/${fn}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ check: true })
        }
      )

      const isActive = expectedActive.includes(fn)

      if (response.status === 404) {
        // Function not found
        if (isActive) {
          results.active.missing.push(fn)
        } else {
          results.archived.confirmed.push(fn)
        }
      } else {
        // Function exists (any other status means it's deployed)
        if (isActive) {
          results.active.confirmed.push(fn)
        } else {
          results.archived.still_deployed.push(fn)
        }
      }
    } catch (e: any) {
      // Network error or other issue - mark as unknown
      results[expectedActive.includes(fn) ? 'active' : 'archived'].missing = results[expectedActive.includes(fn) ? 'active' : 'archived'].missing || []
      results[expectedActive.includes(fn) ? 'active' : 'archived'].missing.push(`${fn} (error: ${e.message})`)
    }
  }

  return new Response(JSON.stringify({
    summary: {
      active_confirmed: results.active.confirmed.length,
      active_missing: results.active.missing.length,
      archived_confirmed: results.archived.confirmed.length,
      archived_still_deployed: results.archived.still_deployed.length
    },
    ...results
  }, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  })
})
