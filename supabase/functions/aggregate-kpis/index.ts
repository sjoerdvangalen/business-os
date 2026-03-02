import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Aggregate KPIs — daily aggregation of campaign metrics
 *
 * Runs daily at 05:00 UTC via pg_cron.
 * Pulls current campaign stats from PlusVibe and writes per-campaign daily_kpis rows.
 * Also aggregates per-client totals.
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
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const dateStr = yesterday.toISOString().split('T')[0]

    // Fetch campaign stats from PlusVibe for yesterday
    const pvResponse = await fetch(
      `https://api.plusvibe.ai/api/v1/analytics/campaign-stats?workspace_id=${workspaceId}&start_date=${dateStr}&end_date=${dateStr}`,
      { headers: { 'x-api-key': apiKey } }
    )
    if (!pvResponse.ok) throw new Error(`PlusVibe API error: ${pvResponse.status}`)

    const statsResult = await pvResponse.json()
    const campaignStats = statsResult.campaigns || statsResult.data || statsResult || []

    // Pre-load campaign mapping
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, client_id, plusvibe_id')
    const campaignMap = new Map<string, { id: string; client_id: string }>()
    for (const c of campaigns || []) {
      if (c.plusvibe_id) campaignMap.set(c.plusvibe_id, { id: c.id, client_id: c.client_id })
    }

    let created = 0, updated = 0, failed = 0

    // Per-campaign KPIs
    for (const stat of (Array.isArray(campaignStats) ? campaignStats : [])) {
      const campInfo = stat.camp_id ? campaignMap.get(stat.camp_id) : null
      if (!campInfo) continue

      const kpiData = {
        date: dateStr,
        client_id: campInfo.client_id,
        campaign_id: campInfo.id,
        emails_sent: stat.sent_count || stat.emails_sent || 0,
        prospects_contacted: stat.contacted_count || stat.lead_contacted_count || 0,
        replies: stat.replied_count || stat.replies || 0,
        bounces: stat.bounced_count || stat.bounces || 0,
        positive_replies: stat.positive_reply_count || stat.positive_replies || 0,
        meeting_requests: stat.meeting_count || 0,
        meetings_booked: stat.meeting_count || 0,
        interested_count: stat.interested_count || stat.positive_reply_count || 0,
        meeting_count: stat.meeting_count || 0,
        unsubscribe_count: stat.unsubscribed_count || 0,
        reply_rate: stat.sent_count > 0
          ? Math.round((stat.replied_count || 0) / stat.sent_count * 10000) / 100
          : 0,
        bounce_rate: stat.sent_count > 0
          ? Math.round((stat.bounced_count || 0) / stat.sent_count * 10000) / 100
          : 0,
        positive_rate: (stat.replied_count || 0) > 0
          ? Math.round((stat.positive_reply_count || 0) / stat.replied_count * 10000) / 100
          : 0,
        interested_rate: stat.sent_count > 0
          ? (stat.interested_count || stat.positive_reply_count || 0) / stat.sent_count
          : 0,
      }

      // Upsert by (date, campaign_id)
      const { data: existing } = await supabase
        .from('daily_kpis')
        .select('id')
        .eq('date', dateStr)
        .eq('campaign_id', campInfo.id)
        .single()

      if (existing) {
        const { error } = await supabase
          .from('daily_kpis')
          .update(kpiData)
          .eq('id', existing.id)
        if (error) { failed++; console.error(`Update KPI failed:`, error.message) }
        else updated++
      } else {
        const { error } = await supabase
          .from('daily_kpis')
          .insert(kpiData)
        if (error) { failed++; console.error(`Insert KPI failed:`, error.message) }
        else created++
      }
    }

    // Also create/update aggregated client-level KPI rows (for backward compat with existing view)
    const { data: clientCampaigns } = await supabase
      .from('daily_kpis')
      .select('client_id, emails_sent, replies, bounces, positive_replies, interested_count, meeting_count')
      .eq('date', dateStr)
      .not('campaign_id', 'is', null)

    // Group by client_id
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
      agg.meetings += row.meeting_count || 0
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

      // Upsert by (date, client_id) where campaign_id is null
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

    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
