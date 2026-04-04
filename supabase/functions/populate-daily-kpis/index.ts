import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Populate Daily KPIs — daily aggregation of campaign metrics from PlusVibe
 *
 * Runs daily at 05:00 UTC via pg_cron.
 * Pulls yesterday's campaign stats from PlusVibe analytics API.
 * Writes per-campaign + per-client aggregated rows to daily_kpis.
 *
 * Also supports backfill: POST { "date": "2026-01-15" } to aggregate a specific date.
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
    const apiKey = Deno.env.get('PLUSVIBE_API_KEY')!
    const workspaceId = Deno.env.get('PLUSVIBE_WORKSPACE_ID')!

    // Support manual date override for backfill
    let dateStr: string
    try {
      const body = await req.json()
      dateStr = body.date || ''
    } catch {
      dateStr = ''
    }

    if (!dateStr) {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      dateStr = yesterday.toISOString().split('T')[0]
    }

    console.log(`Aggregating KPIs for ${dateStr}`)

    // Fetch campaign stats from PlusVibe for the target date
    const pvResponse = await fetch(
      `https://api.plusvibe.ai/api/v1/analytics/campaign-stats?workspace_id=${workspaceId}&start_date=${dateStr}&end_date=${dateStr}`,
      { headers: { 'x-api-key': apiKey } }
    )
    if (!pvResponse.ok) throw new Error(`PlusVibe API error: ${pvResponse.status}`)

    const statsResult = await pvResponse.json()
    const campaignStats = statsResult.campaigns || statsResult.data || statsResult || []

    // Pre-load campaign mapping (provider_campaign_id → our id + client_id)
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, client_id, provider_campaign_id')
    const campaignMap = new Map<string, { id: string; client_id: string }>()
    for (const c of campaigns || []) {
      if (c.provider_campaign_id) campaignMap.set(c.provider_campaign_id, { id: c.id, client_id: c.client_id })
    }

    let created = 0, updated = 0, failed = 0

    // Per-campaign KPIs
    for (const stat of (Array.isArray(campaignStats) ? campaignStats : [])) {
      const campInfo = stat.camp_id ? campaignMap.get(stat.camp_id) : null
      if (!campInfo) continue

      const sentCount = stat.sent_count || stat.emails_sent || 0
      const repliedCount = stat.replied_count || stat.replies || 0
      const bouncedCount = stat.bounced_count || stat.bounces || 0
      const positiveCount = stat.positive_reply_count || stat.positive_replies || 0
      const interestedCount = stat.interested_count || positiveCount || 0
      const meetingCount = stat.meeting_count || 0

      const kpiData = {
        date: dateStr,
        client_id: campInfo.client_id,
        campaign_id: campInfo.id,
        emails_sent: sentCount,
        prospects_contacted: stat.contacted_count || stat.lead_contacted_count || 0,
        replies: repliedCount,
        bounces: bouncedCount,
        positive_replies: positiveCount,
        meeting_requests: meetingCount,
        meetings_booked: meetingCount,
        interested_count: interestedCount,
        unsubscribe_count: stat.unsubscribed_count || 0,
        reply_rate: sentCount > 0 ? Math.round(repliedCount / sentCount * 10000) / 100 : 0,
        bounce_rate: sentCount > 0 ? Math.round(bouncedCount / sentCount * 10000) / 100 : 0,
        positive_rate: repliedCount > 0 ? Math.round(positiveCount / repliedCount * 10000) / 100 : 0,
        interested_rate: sentCount > 0 ? interestedCount / sentCount : 0,
      }

      // Upsert by (date, campaign_id)
      const { data: existing } = await supabase
        .from('daily_kpis')
        .select('id')
        .eq('date', dateStr)
        .eq('campaign_id', campInfo.id)
        .single()

      if (existing) {
        const { error } = await supabase.from('daily_kpis').update(kpiData).eq('id', existing.id)
        if (error) { failed++; console.error(`Update KPI failed:`, error.message) }
        else updated++
      } else {
        const { error } = await supabase.from('daily_kpis').insert(kpiData)
        if (error) { failed++; console.error(`Insert KPI failed:`, error.message) }
        else created++
      }
    }

    // Aggregate per-client totals (campaign_id = null row)
    const { data: clientCampaigns } = await supabase
      .from('daily_kpis')
      .select('client_id, emails_sent, replies, bounces, positive_replies, interested_count, meetings_booked')
      .eq('date', dateStr)
      .not('campaign_id', 'is', null)

    const clientAgg = new Map<string, {
      emails_sent: number; replies: number; bounces: number;
      positive_replies: number; interested: number; meetings: number
    }>()
    for (const row of clientCampaigns || []) {
      if (!row.client_id) continue
      const agg = clientAgg.get(row.client_id) || {
        emails_sent: 0, replies: 0, bounces: 0, positive_replies: 0, interested: 0, meetings: 0
      }
      agg.emails_sent += row.emails_sent || 0
      agg.replies += row.replies || 0
      agg.bounces += row.bounces || 0
      agg.positive_replies += row.positive_replies || 0
      agg.interested += row.interested_count || 0
      agg.meetings += row.meetings_booked || 0
      clientAgg.set(row.client_id, agg)
    }

    for (const [clientId, agg] of clientAgg) {
      const clientKpi = {
        date: dateStr,
        client_id: clientId,
        emails_sent: agg.emails_sent,
        replies: agg.replies,
        bounces: agg.bounces,
        positive_replies: agg.positive_replies,
        reply_rate: agg.emails_sent > 0 ? Math.round(agg.replies / agg.emails_sent * 10000) / 100 : 0,
        bounce_rate: agg.emails_sent > 0 ? Math.round(agg.bounces / agg.emails_sent * 10000) / 100 : 0,
        positive_rate: agg.replies > 0 ? Math.round(agg.positive_replies / agg.replies * 10000) / 100 : 0,
      }

      const { data: existing } = await supabase
        .from('daily_kpis')
        .select('id')
        .eq('date', dateStr)
        .eq('client_id', clientId)
        .is('campaign_id', null)
        .single()

      if (existing) {
        await supabase.from('daily_kpis').update(clientKpi).eq('id', existing.id)
      } else {
        await supabase.from('daily_kpis').insert(clientKpi)
      }
    }

    // Log sync
    const completedAt = new Date()
    await supabase.from('sync_log').insert({
      source: 'plusvibe',
      table_name: 'daily_kpis',
      operation: 'aggregate',
      records_processed: created + updated + failed,
      records_created: created,
      records_updated: updated,
      records_failed: failed,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
    })

    console.log(`KPIs for ${dateStr}: ${created} created, ${updated} updated, ${failed} failed`)

    return new Response(
      JSON.stringify({ success: true, date: dateStr, created, updated, failed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const completedAt = new Date()
    await supabase.from('sync_log').insert({
      source: 'plusvibe',
      table_name: 'daily_kpis',
      operation: 'aggregate',
      records_failed: 1,
      error_message: (error as Error).message,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
    })

    console.error('KPI aggregation error:', (error as Error).message)
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
