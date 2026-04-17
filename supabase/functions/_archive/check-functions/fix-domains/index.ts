import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const results: any = { steps: [] }

  // Step 1: Get ALL inboxes with pagination
  let allInboxes: any[] = []
  let page = 0
  const pageSize = 1000
  let hasMore = true

  while (hasMore) {
    const { data: inboxes, error: fetchError } = await supabase
      .from('email_inboxes')
      .select('id, email, client_id')
      .not('email', 'is', null)
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (fetchError) {
      return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 })
    }

    if (inboxes && inboxes.length > 0) {
      allInboxes = allInboxes.concat(inboxes)
      page++
      hasMore = inboxes.length === pageSize
    } else {
      hasMore = false
    }
  }

  // Extract unique domains
  const domainMap = new Map<string, { client_id: string | null, inboxes: string[] }>()
  for (const inbox of allInboxes) {
    if (!inbox.email) continue
    const domain = inbox.email.split('@')[1]
    if (!domain) continue

    if (!domainMap.has(domain)) {
      domainMap.set(domain, { client_id: inbox.client_id, inboxes: [] })
    }
    domainMap.get(domain)!.inboxes.push(inbox.id)
  }

  results.steps.push({
    step: 'extract',
    unique_domains: domainMap.size,
    total_inboxes: allInboxes.length
  })

  // Step 2: Insert domains
  let domainsCreated = 0
  let domainsSkipped = 0
  const domainIdMap = new Map<string, string>()

  for (const [domain, data] of domainMap) {
    // Check if domain already exists
    const { data: existing } = await supabase
      .from('domains')
      .select('id')
      .eq('domain', domain)
      .single()

    if (existing) {
      domainIdMap.set(domain, existing.id)
      domainsSkipped++
      continue
    }

    const { data: inserted, error: insertError } = await supabase
      .from('domains')
      .insert({
        domain,
        client_id: data.client_id,
        spf_status: 'unknown',
        dkim_status: 'unknown',
        dmarc_status: 'unknown',
        health_status: 'UNKNOWN'
      })
      .select('id')
      .single()

    if (insertError) {
      results.steps.push({ step: 'insert_error', domain, error: insertError.message })
    } else if (inserted) {
      domainIdMap.set(domain, inserted.id)
      domainsCreated++
    }
  }

  results.steps.push({
    step: 'domains',
    created: domainsCreated,
    skipped: domainsSkipped,
    total: domainIdMap.size
  })

  // Step 3: Link inboxes to domains
  let linkedCount = 0
  let linkErrors = 0

  for (const inbox of allInboxes) {
    if (!inbox.email) continue
    const domain = inbox.email.split('@')[1]
    if (!domain) continue

    const domainId = domainIdMap.get(domain)
    if (!domainId) {
      linkErrors++
      continue
    }

    const { error: updateError } = await supabase
      .from('email_inboxes')
      .update({ domain_id: domainId })
      .eq('id', inbox.id)

    if (updateError) {
      linkErrors++
    } else {
      linkedCount++
    }
  }

  results.steps.push({
    step: 'link',
    linked: linkedCount,
    errors: linkErrors
  })

  return new Response(JSON.stringify(results, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  })
})
