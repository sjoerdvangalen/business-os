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

    // Default: yesterday's data (today might be incomplete)
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const defaultDate = yesterday.toISOString().split('T')[0]
    const startDate = body.start_date || defaultDate
    const endDate = body.end_date || startDate

    // Fetch workspace-level warmup stats from PlusVibe
    // Response format: { status, emailAcc: { chart_data: [{date, dt, sent, inbox, spam, promotion}], email_domain_detail: {...} } }
    const pvResponse = await fetch(
      `https://api.plusvibe.ai/api/v1/account/warmup-stats?workspace_id=${workspaceId}&start_date=${startDate}&end_date=${endDate}`,
      { headers: { 'x-api-key': apiKey } }
    )
    if (!pvResponse.ok) throw new Error(`PlusVibe API error: ${pvResponse.status}`)

    const pvData = await pvResponse.json()
    const emailAcc = pvData.emailAcc || pvData.data || {}
    const chartData = emailAcc.chart_data || []
    const domainDetail = emailAcc.email_domain_detail || {}

    console.log(`Fetched warmup data: ${chartData.length} days, ${Object.keys(domainDetail).length} domains`)

    // We'll store daily aggregate snapshots per email_account where possible.
    // First, load all email_accounts so we can create aggregate snapshots.
    const { data: emailAccounts } = await supabase
      .from('email_accounts')
      .select('id, email')

    // Build a domain → [account_ids] map for distributing domain-level stats
    const domainAccountsMap = new Map<string, string[]>()
    for (const ea of emailAccounts || []) {
      const domain = ea.email?.split('@')[1]?.toLowerCase()
      if (domain) {
        const existing = domainAccountsMap.get(domain) || []
        existing.push(ea.id)
        domainAccountsMap.set(domain, existing)
      }
    }

    let created = 0, updated = 0, failed = 0

    // For each day in chart_data, create per-domain warmup snapshots
    for (const day of chartData) {
      const date = day.dt // YYYY-MM-DD format
      const totalSent = day.sent || 0
      const totalInbox = day.inbox || 0
      const totalSpam = day.spam || 0
      const totalPromotion = day.promotion || 0

      // Distribute across domains proportionally using domain_detail inbox rates
      for (const [domain, inboxPct] of Object.entries(domainDetail)) {
        const accountIds = domainAccountsMap.get(domain.toLowerCase())
        if (!accountIds || accountIds.length === 0) continue

        // Estimate per-account: divide domain totals evenly among accounts on that domain
        const accountCount = accountIds.length
        // We don't have per-domain send counts, so estimate using proportion
        const domainShare = 1 / Object.keys(domainDetail).length
        const estSent = Math.round(totalSent * domainShare / accountCount)
        const estInbox = Math.round(totalInbox * domainShare / accountCount)
        const estSpam = Math.round(totalSpam * domainShare / accountCount)
        const estPromotion = Math.round(totalPromotion * domainShare / accountCount)

        for (const accountId of accountIds) {
          const snapshotData = {
            email_account_id: accountId,
            date,
            emails_sent: estSent,
            inbox_count: estInbox,
            spam_count: estSpam,
            promotion_count: estPromotion,
            inbox_rate: Number(inboxPct) || 0,
          }

          try {
            const { error } = await supabase
              .from('warmup_snapshots')
              .upsert(snapshotData, { onConflict: 'email_account_id,date' })

            if (error) {
              console.error(`Failed warmup for account ${accountId}:`, error.message)
              failed++
            } else {
              updated++
            }
          } catch (e) {
            console.error(`Error for warmup account ${accountId}:`, e)
            failed++
          }
        }
      }
    }

    // Log to sync_log
    const completedAt = new Date()
    await supabase.from('sync_log').insert({
      source: 'plusvibe',
      table_name: 'warmup_snapshots',
      operation: 'daily_snapshot',
      records_processed: chartData.length,
      records_created: created,
      records_updated: updated,
      records_failed: failed,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
    })

    return new Response(
      JSON.stringify({
        success: true,
        date_range: { start: startDate, end: endDate },
        days: chartData.length,
        domains: Object.keys(domainDetail).length,
        total_accounts: emailAccounts?.length || 0,
        snapshots_upserted: updated,
        failed,
        aggregate: {
          total_warmup_sent: emailAcc.total_warmup_sent,
          inbox_percent: emailAcc.inbox_percent,
          spam_percent: emailAcc.spam_percent,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const completedAt = new Date()
    await supabase.from('sync_log').insert({
      source: 'plusvibe',
      table_name: 'warmup_snapshots',
      operation: 'daily_snapshot',
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
