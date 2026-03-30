import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Sync PlusVibe Warmup — updates email_inboxes with latest warmup rates
 *
 * Fetches workspace warmup stats from PlusVibe and writes
 * latest_inbox_rate, latest_spam_rate, warmup_last_checked
 * directly to the email_inboxes table.
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

    // Fetch 7-day warmup stats for inbox rate calculation
    const endDate = new Date().toISOString().split('T')[0]
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const pvResponse = await fetch(
      `https://api.plusvibe.ai/api/v1/account/warmup-stats?workspace_id=${workspaceId}&start_date=${startDate}&end_date=${endDate}`,
      { headers: { 'x-api-key': apiKey } }
    )
    if (!pvResponse.ok) throw new Error(`PlusVibe API error: ${pvResponse.status}`)

    const pvData = await pvResponse.json()
    const emailAcc = pvData.emailAcc || pvData.data || {}
    const domainDetail = emailAcc.email_domain_detail || {}

    console.log(`Fetched warmup data: ${Object.keys(domainDetail).length} domains`)

    // Load all email inboxes
    const { data: inboxes } = await supabase
      .from('email_inboxes')
      .select('id, email')

    if (!inboxes || inboxes.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No email inboxes to update' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build domain → inbox rate map from PlusVibe data
    const domainRates = new Map<string, number>()
    for (const [domain, inboxPct] of Object.entries(domainDetail)) {
      domainRates.set(domain.toLowerCase(), Number(inboxPct) || 0)
    }

    // Use PlusVibe's own aggregate spam_percent, fall back to chart_data calculation
    const chartData = emailAcc.chart_data || []
    let totalSpam = 0, totalSent = 0
    for (const day of chartData) {
      totalSpam += day.spam || 0
      totalSent += (day.inbox || 0) + (day.spam || 0) + (day.promotion || 0)
    }
    // Compute once — same global rate applied to all inboxes (per-domain spam not available from PlusVibe)
    const globalSpamRate = emailAcc.spam_percent != null
      ? Math.round(Number(emailAcc.spam_percent))
      : (totalSent > 0 ? Math.round(totalSpam / totalSent * 100) : 0)

    const now = new Date().toISOString()
    let updated = 0, failed = 0

    // Update each inbox with its domain's warmup rate
    const BATCH_SIZE = 50
    const updates: Array<{ id: string; latest_inbox_rate: number; latest_spam_rate: number; warmup_last_checked: string }> = []

    for (const inbox of inboxes) {
      const domain = inbox.email?.split('@')[1]?.toLowerCase()
      if (!domain) continue

      const inboxRate = domainRates.get(domain)
      if (inboxRate === undefined) continue

      updates.push({
        id: inbox.id,
        latest_inbox_rate: inboxRate,
        latest_spam_rate: globalSpamRate,
        warmup_last_checked: now,
      })
    }

    // Batch update
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE)
      for (const upd of batch) {
        try {
          const { error } = await supabase
            .from('email_inboxes')
            .update({
              latest_inbox_rate: upd.latest_inbox_rate,
              latest_spam_rate: upd.latest_spam_rate,
              warmup_last_checked: upd.warmup_last_checked,
            })
            .eq('id', upd.id)

          if (error) {
            console.error(`Failed warmup update for ${upd.id}:`, error.message)
            failed++
          } else {
            updated++
          }
        } catch (e) {
          console.error(`Error warmup update for ${upd.id}:`, e)
          failed++
        }
      }
    }

    // Log to sync_log
    const completedAt = new Date()
    await supabase.from('sync_log').insert({
      source: 'plusvibe',
      table_name: 'email_inboxes',
      operation: 'warmup_sync',
      records_processed: inboxes.length,
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
        domains: Object.keys(domainDetail).length,
        total_inboxes: inboxes.length,
        updated,
        failed,
        aggregate: {
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
      table_name: 'email_inboxes',
      operation: 'warmup_sync',
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
