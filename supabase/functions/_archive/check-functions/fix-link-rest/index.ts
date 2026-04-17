import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const results: any = { batches: [], totalLinked: 0 }

  // Get all domains first
  const { data: domains, error: domainError } = await supabase
    .from('domains')
    .select('id, domain')

  if (domainError || !domains) {
    return new Response(JSON.stringify({ error: domainError?.message }), { status: 500 })
  }

  const domainMap = new Map(domains.map(d => [d.domain, d.id]))

  // Process unlinked inboxes in batches
  let hasMore = true
  let batchCount = 0
  const maxBatches = 10

  while (hasMore && batchCount < maxBatches) {
    // Get batch of unlinked inboxes
    const { data: inboxes, error: fetchError } = await supabase
      .from('email_inboxes')
      .select('id, email')
      .is('domain_id', null)
      .not('email', 'is', null)
      .limit(500)

    if (fetchError) {
      return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 })
    }

    if (!inboxes || inboxes.length === 0) {
      hasMore = false
      break
    }

    // Update each inbox in the batch
    let batchLinked = 0
    const updates = []

    for (const inbox of inboxes) {
      const domain = inbox.email?.split('@')[1]
      if (!domain) continue

      const domainId = domainMap.get(domain)
      if (!domainId) {
        // Create domain if it doesn't exist
        const { data: newDomain } = await supabase
          .from('domains')
          .insert({ domain, spf_status: 'unknown', dkim_status: 'unknown', dmarc_status: 'unknown', health_status: 'UNKNOWN' })
          .select('id')
          .single()

        if (newDomain) {
          domainMap.set(domain, newDomain.id)
          updates.push(supabase.from('email_inboxes').update({ domain_id: newDomain.id }).eq('id', inbox.id))
        }
      } else {
        updates.push(supabase.from('email_inboxes').update({ domain_id: domainId }).eq('id', inbox.id))
      }
    }

    // Execute all updates in parallel
    await Promise.all(updates)
    batchLinked = updates.length
    results.totalLinked += batchLinked

    results.batches.push({
      batch: batchCount + 1,
      processed: inboxes.length,
      linked: batchLinked
    })

    batchCount++
    hasMore = inboxes.length === 500
  }

  // Get final counts
  const { count: linkedCount } = await supabase.from('email_inboxes').select('*', { count: 'exact', head: true }).not('domain_id', 'is', null)
  const { count: totalCount } = await supabase.from('email_inboxes').select('*', { count: 'exact', head: true })

  results.final = {
    linked: linkedCount,
    total: totalCount,
    percentage: totalCount ? Math.round((linkedCount || 0) / totalCount * 100) : 0
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  })
})
