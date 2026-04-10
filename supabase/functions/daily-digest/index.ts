import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Daily Digest — Daily summary of all client activity
 *
 * Schedule: dagelijks om 07:00 CET via pg_cron
 *
 * Per klant:
 * [CLIENT_CODE] — Gisteren:
 * - Verzonden: 342 | Replies: 12 (3.5%)
 * - Interested: 3 | Meetings: 1
 * - Health: HEALTHY | Actieve campaigns: 4
 * - Waarschuwingen: [bounce rate FRTC-campaign-3 > 3%]
 *
 * Data bronnen:
 * - campaigns — status, health_status, emails_sent, replies (current totals)
 * - leads — reply classification, lead_status (for interested count)
 * - meetings — booked yesterday
 * - email_accounts — bounce rates, deliverability
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
    // Calculate yesterday's date boundaries in UTC
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(0, 0, 0, 0)

    const yesterdayEnd = new Date(yesterday)
    yesterdayEnd.setHours(23, 59, 59, 999)

    const yesterdayStr = yesterday.toISOString().split('T')[0]
    const yesterdayStartIso = yesterday.toISOString()
    const yesterdayEndIso = yesterdayEnd.toISOString()

    // Load all active clients
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id, name, client_code, slack_channel_id')
      .in('status', ['running', 'scaling'])
      .order('client_code')

    if (clientsError) throw new Error(`Failed to fetch clients: ${clientsError.message}`)

    // Load active campaigns with stats for all clients
    const { data: campaigns, error: campaignsError } = await supabase
      .from('campaigns')
      .select(`
        id, name, client_id, status, health_status,
        emails_sent, replies, bounces, positive_replies,
        reply_rate, bounce_rate, open_rate,
        total_leads, leads_contacted, unsubscribes,
        monitoring_notes, last_synced_at
      `)
      .in('status', ['ACTIVE', 'RUNNING'])

    if (campaignsError) throw new Error(`Failed to fetch campaigns: ${campaignsError.message}`)

    // Group campaigns by client
    const campaignsByClient = new Map<string, typeof campaigns>()
    for (const camp of campaigns || []) {
      const list = campaignsByClient.get(camp.client_id) || []
      list.push(camp)
      campaignsByClient.set(camp.client_id, list)
    }

    // Get yesterday's interested leads (new interested status)
    const { data: interestedLeads, error: leadsError } = await supabase
      .from('leads')
      .select('client_id, status, updated_at')
      .eq('status', 'interested')
      .gte('updated_at', yesterdayStartIso)
      .lte('updated_at', yesterdayEndIso)

    if (leadsError) throw new Error(`Failed to fetch leads: ${leadsError.message}`)

    // Count interested by client
    const interestedByClient = new Map<string, number>()
    for (const lead of interestedLeads || []) {
      interestedByClient.set(lead.client_id, (interestedByClient.get(lead.client_id) || 0) + 1)
    }

    // Get yesterday's meetings (booked yesterday)
    const { data: meetings, error: meetingsError } = await supabase
      .from('meetings')
      .select('client_id, booking_status, created_at')
      .in('booking_status', ['booked', 'rescheduled', 'qualified'])
      .gte('created_at', yesterdayStartIso)
      .lte('created_at', yesterdayEndIso)

    if (meetingsError) throw new Error(`Failed to fetch meetings: ${meetingsError.message}`)

    // Count meetings by client
    const meetingsByClient = new Map<string, number>()
    for (const m of meetings || []) {
      meetingsByClient.set(m.client_id, (meetingsByClient.get(m.client_id) || 0) + 1)
    }

    // Get email account health for bounce rate warnings
    const { data: emailAccounts, error: accountsError } = await supabase
      .from('email_accounts')
      .select('client_id, email, bounce_rate_3d, status, overall_warmup_health')
      .eq('status', 'connected')

    if (accountsError) throw new Error(`Failed to fetch email accounts: ${accountsError.message}`)

    // Find high bounce rate accounts per client
    const highBounceAccounts = new Map<string, Array<{ email: string; rate: number }>>()
    for (const acc of emailAccounts || []) {
      if (acc.bounce_rate_3d && acc.bounce_rate_3d > 3) {
        const list = highBounceAccounts.get(acc.client_id) || []
        list.push({ email: acc.email, rate: acc.bounce_rate_3d })
        highBounceAccounts.set(acc.client_id, list)
      }
    }

    // Build digest lines per client
    const digestLines: string[] = []
    const warnings: string[] = []
    let totalSent = 0
    let totalReplies = 0
    let totalInterested = 0
    let totalMeetings = 0
    let healthyClients = 0
    let warningClients = 0
    let criticalClients = 0

    for (const client of clients || []) {
      const clientCampaigns = campaignsByClient.get(client.id) || []
      const clientInterested = interestedByClient.get(client.id) || 0
      const clientMeetings = meetingsByClient.get(client.id) || 0
      const clientHighBounce = highBounceAccounts.get(client.id) || []

      // Aggregate campaign stats (using current totals as approximation)
      let clientSent = 0
      let clientReplies = 0
      let activeCampaigns = 0
      let clientHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN' = 'HEALTHY'
      const clientWarnings: string[] = []

      for (const camp of clientCampaigns) {
        clientSent += camp.emails_sent || 0
        clientReplies += camp.replies || 0
        activeCampaigns++

        // Check campaign health
        if (camp.health_status === 'CRITICAL') {
          clientHealth = 'CRITICAL'
          clientWarnings.push(`${camp.name}: CRITICAL`)
        } else if (camp.health_status === 'WARNING' && clientHealth !== 'CRITICAL') {
          clientHealth = 'WARNING'
          clientWarnings.push(`${camp.name}: WARNING`)
        }

        // Check bounce rate
        const bounceRate = camp.bounce_rate || 0
        if (bounceRate > 5) {
          clientWarnings.push(`bounce rate ${bounceRate.toFixed(1)}% in ${camp.name}`)
        } else if (bounceRate > 3) {
          clientWarnings.push(`bounce rate ${bounceRate.toFixed(1)}% in ${camp.name}`)
        }
      }

      // Check email account bounce rates
      for (const acc of clientHighBounce) {
        clientWarnings.push(`bounce rate ${acc.rate.toFixed(1)}% for ${acc.email.split('@')[1] || 'domain'}`)
      }

      // Update health counters
      if (clientHealth === 'CRITICAL') criticalClients++
      else if (clientHealth === 'WARNING') warningClients++
      else if (clientHealth === 'HEALTHY') healthyClients++

      // Calculate reply rate
      const replyRate = clientSent > 0 ? (clientReplies / clientSent * 100).toFixed(1) : '0.0'

      // Build line for this client
      const emoji = clientHealth === 'CRITICAL' ? '🔴' : clientHealth === 'WARNING' ? '⚠️' : '✅'
      digestLines.push(
        `${emoji} *${client.client_code}* — Verzonden: ${clientSent.toLocaleString()} | ` +
        `Replies: ${clientReplies} (${replyRate}%) | ` +
        `Interested: ${clientInterested} | Meetings: ${clientMeetings} | ` +
        `Health: ${clientHealth} (${activeCampaigns} campaigns)`
      )

      // Add warnings if any
      if (clientWarnings.length > 0) {
        warnings.push(`*${client.client_code}*: ${clientWarnings.join(', ')}`)
      }

      // Update totals
      totalSent += clientSent
      totalReplies += clientReplies
      totalInterested += clientInterested
      totalMeetings += clientMeetings
    }

    // Format the full message
    const nlDate = yesterday.toLocaleDateString('nl-NL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    })

    let slackText = `*📊 Daily Digest — ${nlDate}*\n\n`

    // Summary line
    const overallReplyRate = totalSent > 0 ? (totalReplies / totalSent * 100).toFixed(1) : '0.0'
    slackText += `*Totaal:* ${totalSent.toLocaleString()} verzonden | ${totalReplies} replies (${overallReplyRate}%) | ${totalInterested} interested | ${totalMeetings} meetings\n`
    slackText += `*Status:* ${healthyClients}x ✅ | ${warningClients}x ⚠️ | ${criticalClients}x 🔴\n\n`

    // Per-client breakdown
    if (digestLines.length > 0) {
      slackText += `*Per klant:*\n${digestLines.join('\n')}\n`
    }

    // Warnings section
    if (warnings.length > 0) {
      slackText += `\n*⚠️ Waarschuwingen:*\n${warnings.map(w => `• ${w}`).join('\n')}`
    }

    // Send to Slack
    await sendSlackDigest(supabase, slackText)

    // Also populate daily_kpis for historical tracking (if table exists as kpis)
    await populateDailyKpis(supabase, yesterdayStr, clients || [], {
      totalSent,
      totalReplies,
      totalInterested,
      totalMeetings,
    })

    // Log to sync_log
    const completedAt = new Date()
    await supabase.from('sync_log').insert({
      source: 'internal',
      table_name: 'daily_digest',
      operation: 'daily_summary',
      records_processed: clients?.length || 0,
      records_created: 0,
      records_updated: 0,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
    })

    return new Response(
      JSON.stringify({
        success: true,
        date: yesterdayStr,
        clients: clients?.length || 0,
        totals: { sent: totalSent, replies: totalReplies, interested: totalInterested, meetings: totalMeetings },
        health: { healthy: healthyClients, warning: warningClients, critical: criticalClients }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Daily digest error:', (error as Error).message)
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

async function sendSlackDigest(supabase: ReturnType<typeof createClient>, text: string) {
  const slackWebhookUrl = Deno.env.get('SLACK_WEBHOOK_URL')
  const targetChannel = '#vgg-alerts'

  if (!slackWebhookUrl) {
    console.log(`Slack digest (no webhook): ${text.substring(0, 200)}...`)
    await supabase.from('agent_memory').insert({
      agent_id: 'daily-digest',
      memory_type: 'slack_pending',
      content: text,
      metadata: { channel: targetChannel, type: 'daily_digest' },
    })
    return
  }

  try {
    const response = await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: targetChannel, text }),
    })

    if (!response.ok) {
      console.error('Slack API error:', response.status, await response.text())
    }
  } catch (e) {
    console.error('Slack send error:', (e as Error).message)
  }
}

async function populateDailyKpis(
  supabase: ReturnType<typeof createClient>,
  dateStr: string,
  clients: Array<{ id: string }>,
  totals: { totalSent: number; totalReplies: number; totalInterested: number; totalMeetings: number }
) {
  // Try to insert/update into kpis table (formerly daily_kpis)
  try {
    for (const client of clients) {
      const { data: existing } = await supabase
        .from('kpis')
        .select('id')
        .eq('date', dateStr)
        .eq('client_id', client.id)
        .is('campaign_id', null)
        .single()

      const kpiData = {
        date: dateStr,
        client_id: client.id,
        emails_sent: totals.totalSent,
        replies: totals.totalReplies,
        positive_replies: totals.totalInterested,
        meetings_booked: totals.totalMeetings,
        reply_rate: totals.totalSent > 0 ? Math.round(totals.totalReplies / totals.totalSent * 10000) / 100 : 0,
      }

      if (existing) {
        await supabase.from('kpis').update(kpiData).eq('id', existing.id)
      } else {
        await supabase.from('kpis').insert(kpiData)
      }
    }
  } catch (e) {
    // Table might not exist or have different schema — log but don't fail
    console.log('KPI population skipped:', (e as Error).message)
  }
}
