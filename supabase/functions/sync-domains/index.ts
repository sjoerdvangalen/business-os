import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Sync Domains — extracts unique domains from email_inboxes,
 * checks SPF/DKIM/DMARC via PlusVibe, and upserts to domains table.
 *
 * Runs daily via pg_cron.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startedAt = new Date()
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const body = await req.json().catch(() => ({}))
    const apiKey = body.api_key || Deno.env.get('PLUSVIBE_API_KEY')
    const workspaceId = body.workspace_id || Deno.env.get('PLUSVIBE_WORKSPACE_ID')

    if (!apiKey || !workspaceId) {
      return new Response(
        JSON.stringify({ error: 'Missing PLUSVIBE_API_KEY or PLUSVIBE_WORKSPACE_ID' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // 1. Get all email inboxes with their domain + client info
    const { data: inboxes } = await supabase
      .from('email_inboxes')
      .select('id, email, client_id, provider, status, warmup_status')

    if (!inboxes || inboxes.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No email inboxes found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Extract unique domains with their accounts
    const domainMap = new Map<string, {
      emails: string[]
      providers: Set<string>
      clientIds: Set<string>
      totalAccounts: number
      disconnected: number
      warmupActive: number
    }>()

    for (const inbox of inboxes) {
      const domain = inbox.email?.split('@')[1]?.toLowerCase()
      if (!domain) continue

      const entry = domainMap.get(domain) || {
        emails: [],
        providers: new Set<string>(),
        clientIds: new Set<string>(),
        totalAccounts: 0,
        disconnected: 0,
        warmupActive: 0,
      }

      entry.emails.push(inbox.email)
      if (inbox.provider) entry.providers.add(inbox.provider)
      if (inbox.client_id) entry.clientIds.add(inbox.client_id)
      entry.totalAccounts++
      if (inbox.status === 'disconnected') entry.disconnected++
      if (inbox.warmup_status === 'active') entry.warmupActive++

      domainMap.set(domain, entry)
    }

    console.log(`Found ${domainMap.size} unique domains from ${inboxes.length} inboxes`)

    // 3. Check SPF/DKIM/DMARC via PlusVibe (batch of 10)
    const healthResults = new Map<string, { spf: string; dkim: string; dmarc: string }>()
    const domainEntries = Array.from(domainMap.entries())

    for (let i = 0; i < domainEntries.length; i += 10) {
      const batch = domainEntries.slice(i, i + 10)
      const checkAccounts = batch.map(([_, info]) => ({ email: info.emails[0] }))

      try {
        const pvResponse = await fetch(
          'https://api.plusvibe.ai/api/v1/account/check-health',
          {
            method: 'POST',
            headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspace_id: workspaceId,
              accounts: checkAccounts,
            }),
          }
        )

        if (pvResponse.ok) {
          const result = await pvResponse.json()
          const records = result.data || result.accounts || result || []
          for (const rec of (Array.isArray(records) ? records : [])) {
            const email = rec.email || ''
            const domainPart = email.split('@')[1]?.toLowerCase()
            if (domainPart) {
              healthResults.set(domainPart, {
                spf: (rec.spf === 'pass' || rec.spf === true) ? 'pass' : 'fail',
                dkim: (rec.dkim === 'pass' || rec.dkim === true) ? 'pass' : 'fail',
                dmarc: (rec.dmarc === 'pass' || rec.dmarc === true) ? 'pass' : 'fail',
              })
            }
          }
        }
      } catch (e) {
        console.error(`Health check batch error:`, (e as Error).message)
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 250))
    }

    // 4. Load existing domains for update vs insert
    const { data: existingDomains } = await supabase
      .from('domains')
      .select('id, domain')

    const existingMap = new Map<string, string>()
    for (const d of existingDomains || []) {
      if (d.domain) existingMap.set(d.domain.toLowerCase(), d.id)
    }

    // 5. Upsert domains
    let created = 0, updated = 0, failed = 0

    for (const [domain, info] of domainMap) {
      const health = healthResults.get(domain)
      const provider = info.providers.size > 0 ? Array.from(info.providers)[0] : null
      const clientId = info.clientIds.size > 0 ? Array.from(info.clientIds)[0] : null

      const domainIssues: string[] = []
      if (health?.spf === 'fail') domainIssues.push('SPF fail')
      if (health?.dkim === 'fail') domainIssues.push('DKIM fail')
      if (health?.dmarc === 'fail') domainIssues.push('DMARC fail')
      if (info.totalAccounts > 0 && info.disconnected / info.totalAccounts > 0.25) {
        domainIssues.push('High disconnect rate')
      }

      const healthStatus = domainIssues.length > 0 ? 'CRITICAL' : 'HEALTHY'

      const domainData = {
        domain,
        client_id: clientId,
        provider,
        spf_status: health?.spf || 'unknown',
        dkim_status: health?.dkim || 'unknown',
        dmarc_status: health?.dmarc || 'unknown',
        health_status: healthStatus,
        last_health_check: new Date().toISOString(),
      }

      try {
        const existingId = existingMap.get(domain)
        if (existingId) {
          const { error } = await supabase
            .from('domains')
            .update(domainData)
            .eq('id', existingId)
          if (error) {
            console.error(`Update failed for ${domain}:`, error.message)
            failed++
          } else {
            updated++
          }
        } else {
          const { error } = await supabase
            .from('domains')
            .insert(domainData)
          if (error) {
            console.error(`Insert failed for ${domain}:`, error.message)
            failed++
          } else {
            created++
          }
        }
      } catch (e) {
        console.error(`Error for ${domain}:`, (e as Error).message)
        failed++
      }
    }

    // 6. Log to sync_log
    const completedAt = new Date()
    await supabase.from('sync_log').insert({
      source: 'plusvibe',
      table_name: 'domains',
      operation: 'full_sync',
      records_processed: domainMap.size,
      records_created: created,
      records_updated: updated,
      records_failed: failed,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
    })

    // 7. Update email_inboxes with domain_id for any that don't have one
    const { data: allDomains } = await supabase
      .from('domains')
      .select('id, domain')

    const domainIdMap = new Map<string, string>()
    for (const d of allDomains || []) {
      if (d.domain) domainIdMap.set(d.domain.toLowerCase(), d.id)
    }

    let linked = 0
    for (const inbox of inboxes) {
      const domain = inbox.email?.split('@')[1]?.toLowerCase()
      if (!domain) continue
      const domainId = domainIdMap.get(domain)
      if (domainId) {
        await supabase
          .from('email_inboxes')
          .update({ domain_id: domainId })
          .eq('id', inbox.id)
        linked++
      }
    }

    console.log(`Domains: ${created} created, ${updated} updated, ${failed} failed. Linked ${linked} inboxes.`)

    return new Response(
      JSON.stringify({
        success: true,
        domains: domainMap.size,
        created,
        updated,
        failed,
        inboxes_linked: linked,
        health_checked: healthResults.size,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const completedAt = new Date()
    await supabase.from('sync_log').insert({
      source: 'plusvibe',
      table_name: 'domains',
      operation: 'full_sync',
      records_failed: 1,
      error_message: (error as Error).message,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
    })

    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
