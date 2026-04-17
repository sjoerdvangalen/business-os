import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const results: any = { steps: [] }

  try {
    // Step 1: Insert missing domains using a single query
    const { data: domainInsert, error: domainError } = await supabase.rpc('exec_sql', {
      sql: `
        INSERT INTO domains (domain, client_id, spf_status, dkim_status, dmarc_status, health_status, created_at, updated_at)
        SELECT DISTINCT
          SPLIT_PART(email, '@', 2) as domain,
          client_id,
          'unknown' as spf_status,
          'unknown' as dkim_status,
          'unknown' as dmarc_status,
          'UNKNOWN' as health_status,
          NOW() as created_at,
          NOW() as updated_at
        FROM email_inboxes
        WHERE email IS NOT NULL
          AND SPLIT_PART(email, '@', 2) NOT IN (SELECT domain FROM domains WHERE domain IS NOT NULL)
        ON CONFLICT (domain) DO NOTHING
        RETURNING id, domain
      `
    })

    results.steps.push({
      step: 'insert_domains',
      result: domainInsert,
      error: domainError?.message
    })

    // Step 2: Bulk update inboxes to link to domains
    const { data: linkResult, error: linkError } = await supabase.rpc('exec_sql', {
      sql: `
        UPDATE email_inboxes ei
        SET domain_id = d.id
        FROM domains d
        WHERE SPLIT_PART(ei.email, '@', 2) = d.domain
          AND ei.domain_id IS NULL
        RETURNING ei.id
      `
    })

    results.steps.push({
      step: 'link_inboxes',
      linked_count: linkResult?.length,
      error: linkError?.message
    })

    // Step 3: Get final counts
    const { count: domainCount } = await supabase.from('domains').select('*', { count: 'exact', head: true })
    const { count: linkedCount } = await supabase.from('email_inboxes').select('*', { count: 'exact', head: true }).not('domain_id', 'is', null)
    const { count: totalCount } = await supabase.from('email_inboxes').select('*', { count: 'exact', head: true })

    results.steps.push({
      step: 'final_counts',
      domains: domainCount,
      linked_inboxes: linkedCount,
      total_inboxes: totalCount,
      percentage: totalCount ? Math.round((linkedCount || 0) / totalCount * 100) : 0
    })

    return new Response(JSON.stringify(results, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
