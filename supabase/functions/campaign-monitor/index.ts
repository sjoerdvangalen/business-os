import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Campaign Monitor Agent — proactive health checks every 15 minutes
 *
 * Alert thresholds (from outbound-playbook.md):
 * - Bounce rate: WARNING >3%, CRITICAL >5%
 * - Reply rate: WARNING <1% (after 500 sent), CRITICAL <0.5%
 * - Open rate: WARNING <30%, CRITICAL <20%
 * - Disconnected accounts: WARNING >10%, CRITICAL >25%
 *
 * Actions:
 * - Updates campaigns.health_status
 * - Writes alerts to agent_memory
 * - Sends Slack notifications for WARNING/CRITICAL
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
    // Fetch active campaigns with their stats
    const { data: campaigns, error: campError } = await supabase
      .from('campaigns')
      .select(`
        id, name, client_id, status, plusvibe_id,
        emails_sent, replies, bounces, unsubscribes,
        open_rate, reply_rate, bounce_rate,
        positive_replies, negative_replies,
        total_leads, leads_contacted,
        health_status, alert_count, monitoring_notes
      `)
      .eq('status', 'ACTIVE')

    if (campError) throw new Error(`Failed to fetch campaigns: ${campError.message}`)

    // Load client names for alert messages
    const { data: clients } = await supabase.from('clients').select('id, name, client_code')
    const clientMap = new Map<string, { name: string; code: string }>()
    for (const c of clients || []) {
      clientMap.set(c.id, { name: c.name, code: c.client_code })
    }

    const alerts: Array<{ campaign: string; level: string; message: string }> = []
    let checked = 0, warnings = 0, criticals = 0

    for (const camp of campaigns || []) {
      checked++
      const issues: Array<{ level: string; metric: string; value: number; threshold: number; message: string }> = []
      const sent = camp.emails_sent || 0
      const client = clientMap.get(camp.client_id)

      // Only check campaigns with enough data
      if (sent < 50) {
        await supabase.from('campaigns').update({
          health_status: 'UNKNOWN',
          last_health_check: new Date().toISOString(),
        }).eq('id', camp.id)
        continue
      }

      // --- Bounce Rate ---
      const bounceRate = camp.bounce_rate || (sent > 0 ? (camp.bounces || 0) / sent * 100 : 0)
      if (bounceRate > 5) {
        issues.push({ level: 'CRITICAL', metric: 'bounce_rate', value: bounceRate, threshold: 5, message: `Bounce rate ${bounceRate.toFixed(1)}% (>5%) — pause campaign or check list quality` })
      } else if (bounceRate > 3) {
        issues.push({ level: 'WARNING', metric: 'bounce_rate', value: bounceRate, threshold: 3, message: `Bounce rate ${bounceRate.toFixed(1)}% (>3%) — monitor closely` })
      }

      // --- Reply Rate ---
      const replyRate = camp.reply_rate || (sent > 0 ? (camp.replies || 0) / sent * 100 : 0)
      if (sent >= 500 && replyRate < 0.5) {
        issues.push({ level: 'CRITICAL', metric: 'reply_rate', value: replyRate, threshold: 0.5, message: `Reply rate ${replyRate.toFixed(2)}% (<0.5% after 500 sent) — copy needs refresh` })
      } else if (sent >= 500 && replyRate < 1) {
        issues.push({ level: 'WARNING', metric: 'reply_rate', value: replyRate, threshold: 1, message: `Reply rate ${replyRate.toFixed(2)}% (<1% after 500 sent) — consider copy optimization` })
      }

      // --- Open Rate ---
      const openRate = camp.open_rate || 0
      if (sent >= 100 && openRate > 0) {
        if (openRate < 20) {
          issues.push({ level: 'CRITICAL', metric: 'open_rate', value: openRate, threshold: 20, message: `Open rate ${openRate.toFixed(1)}% (<20%) — check subject lines and deliverability` })
        } else if (openRate < 30) {
          issues.push({ level: 'WARNING', metric: 'open_rate', value: openRate, threshold: 30, message: `Open rate ${openRate.toFixed(1)}% (<30%) — test different subject lines` })
        }
      }

      // --- Unsubscribe Rate ---
      const unsubRate = sent > 0 ? (camp.unsubscribes || 0) / sent * 100 : 0
      if (sent >= 200 && unsubRate > 2) {
        issues.push({ level: 'WARNING', metric: 'unsubscribe_rate', value: unsubRate, threshold: 2, message: `Unsubscribe rate ${unsubRate.toFixed(1)}% (>2%) — review targeting or messaging` })
      }

      // Determine overall health
      const hasCritical = issues.some(i => i.level === 'CRITICAL')
      const hasWarning = issues.some(i => i.level === 'WARNING')
      const newHealth = hasCritical ? 'CRITICAL' : hasWarning ? 'WARNING' : 'HEALTHY'
      const previousHealth = camp.health_status

      // Only alert on status changes or if still critical
      const shouldAlert = (newHealth !== 'HEALTHY' && newHealth !== previousHealth) ||
                          (newHealth === 'CRITICAL')

      // Update campaign
      const monitoringNotes = (camp.monitoring_notes || []) as Array<unknown>
      if (issues.length > 0) {
        monitoringNotes.unshift({
          timestamp: new Date().toISOString(),
          health: newHealth,
          issues: issues.map(i => `${i.level}: ${i.message}`),
        })
        // Keep last 20 notes
        while (monitoringNotes.length > 20) monitoringNotes.pop()
      }

      await supabase.from('campaigns').update({
        health_status: newHealth,
        last_health_check: new Date().toISOString(),
        alert_count: shouldAlert ? (camp.alert_count || 0) + 1 : camp.alert_count || 0,
        monitoring_notes: monitoringNotes,
      }).eq('id', camp.id)


      if (hasCritical) criticals++
      if (hasWarning && !hasCritical) warnings++

      // Store alerts
      if (shouldAlert) {
        for (const issue of issues) {
          alerts.push({
            campaign: `${client?.code || '???'} | ${camp.name}`,
            level: issue.level,
            message: issue.message,
          })

          await supabase.from('agent_memory').insert({
            agent_id: 'campaign-monitor',
            memory_type: 'campaign_alert',
            content: `[${issue.level}] ${client?.code} | ${camp.name}: ${issue.message}`,
            metadata: {
              campaign_id: camp.id,
              client_id: camp.client_id,
              client_code: client?.code,
              metric: issue.metric,
              value: issue.value,
              threshold: issue.threshold,
              level: issue.level,
            },
          })
        }
      }
    }

    // Send Slack summary if there are alerts
    if (alerts.length > 0) {
      const criticalAlerts = alerts.filter(a => a.level === 'CRITICAL')
      const warningAlerts = alerts.filter(a => a.level === 'WARNING')

      let slackText = `⚡ *Campaign Health Check*\n`
      slackText += `Checked: ${checked} | ✅ ${checked - warnings - criticals} Healthy | ⚠️ ${warnings} Warning | 🔴 ${criticals} Critical\n\n`

      if (criticalAlerts.length > 0) {
        slackText += `*🔴 CRITICAL:*\n`
        for (const a of criticalAlerts) {
          slackText += `• ${a.campaign}: ${a.message}\n`
        }
        slackText += '\n'
      }

      if (warningAlerts.length > 0) {
        slackText += `*⚠️ WARNING:*\n`
        for (const a of warningAlerts) {
          slackText += `• ${a.campaign}: ${a.message}\n`
        }
      }

      await sendSlackAlert(supabase, slackText)
    }

    // Log sync
    const completedAt = new Date()
    await supabase.from('sync_log').insert({
      source: 'internal',
      table_name: 'campaigns',
      operation: 'health_check',
      records_processed: checked,
      records_updated: warnings + criticals,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
    })


    return new Response(
      JSON.stringify({ success: true, checked, warnings, criticals, alerts: alerts.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Campaign monitor error:', (error as Error).message)
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

async function sendSlackAlert(supabase: ReturnType<typeof createClient>, text: string) {
  const slackWebhookUrl = Deno.env.get('SLACK_WEBHOOK_URL')
  if (!slackWebhookUrl) {
    console.log(`Slack alert (no webhook): ${text}`)
    await supabase.from('agent_memory').insert({
      agent_id: 'campaign-monitor',
      memory_type: 'slack_pending',
      content: text,
      metadata: { channel: 'sales-alerts' },
    })
    return
  }

  try {
    await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: '#sales-alerts', text }),
    })
  } catch (e) {
    console.error('Slack error:', (e as Error).message)
  }
}
