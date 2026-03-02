import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

    // Fetch all email accounts from PlusVibe (paginated)
    let allAccounts: any[] = []
    let skip = 0
    const limit = 100
    let hasMore = true

    while (hasMore) {
      const pvResponse = await fetch(
        `https://api.plusvibe.ai/api/v1/account/list?workspace_id=${workspaceId}&limit=${limit}&skip=${skip}`,
        { headers: { 'x-api-key': apiKey } }
      )
      if (!pvResponse.ok) throw new Error(`PlusVibe API error: ${pvResponse.status}`)

      const pvData = await pvResponse.json()
      const accounts = pvData.accounts || pvData.data || pvData || []
      allAccounts.push(...accounts)

      if (accounts.length < limit) {
        hasMore = false
      } else {
        skip += limit
      }
    }

    console.log(`Fetched ${allAccounts.length} email accounts from PlusVibe`)

    // Pre-load clients and domains for matching
    const { data: clients } = await supabase.from('clients').select('id, client_code')
    const clientMap = new Map<string, string>()
    for (const c of clients || []) {
      if (c.client_code) clientMap.set(c.client_code.toUpperCase(), c.id)
    }

    const { data: domains } = await supabase.from('domains').select('id, domain')
    const domainMap = new Map<string, string>()
    for (const d of domains || []) {
      if (d.domain) domainMap.set(d.domain.toLowerCase(), d.id)
    }

    let updated = 0, failed = 0
    const now = new Date().toISOString()

    // Map all accounts to upsert data
    const allRecords = allAccounts.map(acct => {
      const emailDomain = acct.email?.split('@')[1]?.toLowerCase() || ''
      const payload = acct.payload || {}
      const analytics = payload.analytics || {}
      const healthScores = analytics.health_scores || {}
      const dailyCounters = analytics.daily_counters || {}
      const replyRates = analytics.reply_rates || {}

      let clientId: string | null = null
      const campaigns = payload.cmps || []
      if (campaigns.length > 0) {
        const campName = campaigns[0].name || ''
        const clientCode = campName.split('|')[0]?.trim()?.toUpperCase()
        clientId = clientCode ? clientMap.get(clientCode) || null : null
      }

      const domainId = domainMap.get(emailDomain) || null

      return {
        plusvibe_id: acct.id,
        client_id: clientId,
        domain_id: domainId,
        email: acct.email,
        first_name: payload.name?.first_name || null,
        last_name: payload.name?.last_name || null,
        provider: acct.provider || null,
        status: acct.status || null,
        daily_limit: payload.daily_limit || null,
        interval_limit_min: payload.sending_gap || null,
        emails_sent_today: dailyCounters.email_sent_today || 0,
        warmup_status: acct.warmup_status || null,
        warmup_emails_sent_today: dailyCounters.warmup_email_sent_today || 0,
        google_warmup_health: healthScores['7d_google_warmup_health'] ?? null,
        microsoft_warmup_health: healthScores['7d_microsoft_warmup_health'] ?? null,
        overall_warmup_health: healthScores['7d_overall_warmup_health'] ?? null,
        bounce_rate_3d: healthScores['3d_bounce_rate'] === -1 ? null : healthScores['3d_bounce_rate'],
        reply_rate_7d: replyRates['7d_replyrate'] ?? null,
        last_synced_at: now,
      }
    })

    // Batch upsert in chunks of 50
    const BATCH_SIZE = 50
    for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
      const batch = allRecords.slice(i, i + BATCH_SIZE)
      try {
        const { error } = await supabase
          .from('email_inboxes')
          .upsert(batch, { onConflict: 'plusvibe_id' })

        if (error) {
          console.error(`Batch ${i}-${i + batch.length} failed:`, error.message)
          failed += batch.length
        } else {
          updated += batch.length
        }
      } catch (e) {
        console.error(`Batch ${i}-${i + batch.length} error:`, e)
        failed += batch.length
      }
    }

    // Log to sync_log
    const completedAt = new Date()
    await supabase.from('sync_log').insert({
      source: 'plusvibe',
      table_name: 'email_inboxes',
      operation: 'full_sync',
      records_processed: allAccounts.length,
      records_created: 0,
      records_updated: updated,
      records_failed: failed,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
    })

    return new Response(
      JSON.stringify({ success: true, total: allAccounts.length, updated, failed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const completedAt = new Date()
    await supabase.from('sync_log').insert({
      source: 'plusvibe',
      table_name: 'email_inboxes',
      operation: 'full_sync',
      records_failed: 1,
      error_message: error.message,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
    })

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
