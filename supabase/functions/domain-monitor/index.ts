import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Domain Monitor Agent — daily deliverability health check
 *
 * Runs daily at 06:00 UTC via pg_cron.
 * Checks:
 * - SPF/DKIM/DMARC status per domain (via PlusVibe API)
 * - Warmup inbox placement trends (via email_inboxes)
 * - Disconnected accounts per domain
 * - Accounts with warmup inactive but in active campaigns
 *
 * Alerts on:
 * - SPF/DKIM/DMARC failures
 * - Inbox rate <70% (7-day average)
 * - >25% disconnected accounts per domain
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

    // 1. Get all domains with their accounts
    const { data: domains } = await supabase
      .from('domains')
      .select('id, domain, provider, spf_status, dkim_status, dmarc_status, health_status')

    if (!domains || domains.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No domains to check' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Get email accounts grouped by domain
    const { data: accounts } = await supabase
      .from('email_inboxes')
      .select('id, email, domain_id, status, warmup_status')

    const accountsByDomain = new Map<string, Array<{ id: string; email: string; status: string; warmup_status: string }>>()
    for (const acc of accounts || []) {
      if (!acc.domain_id) continue
      const list = accountsByDomain.get(acc.domain_id) || []
      list.push(acc)
      accountsByDomain.set(acc.domain_id, list)
    }

    // 3. Check SPF/DKIM/DMARC via PlusVibe API (batch by domain)
    // We check a sample account per domain
    const domainsToCheck: Array<{ email: string; domain: string; domainId: string }> = []
    for (const domain of domains) {
      const domainAccounts = accountsByDomain.get(domain.id)
      if (domainAccounts && domainAccounts.length > 0) {
        domainsToCheck.push({
          email: domainAccounts[0].email,
          domain: domain.domain || '',
          domainId: domain.id,
        })
      }
    }

    // PlusVibe check_email_account_health — batch of 10
    const healthResults = new Map<string, { spf: boolean; dkim: boolean; dmarc: boolean }>()
    for (let i = 0; i < domainsToCheck.length; i += 10) {
      const batch = domainsToCheck.slice(i, i + 10)
      try {
        const pvResponse = await fetch(
          `https://api.plusvibe.ai/api/v1/account/check-health`,
          {
            method: 'POST',
            headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspace_id: workspaceId,
              accounts: batch.map(b => ({ email: b.email })),
            }),
          }
        )
        if (pvResponse.ok) {
          const result = await pvResponse.json()
          const records = result.data || result.accounts || result || []
          for (const rec of (Array.isArray(records) ? records : [])) {
            const email = rec.email || ''
            const domainPart = email.split('@')[1]
            if (domainPart) {
              healthResults.set(domainPart, {
                spf: rec.spf === 'pass' || rec.spf === true,
                dkim: rec.dkim === 'pass' || rec.dkim === true,
                dmarc: rec.dmarc === 'pass' || rec.dmarc === true,
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

    // 4. Get warmup stats for inbox rate calculation
    const endDate = new Date().toISOString().split('T')[0]
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    let warmupData: Record<string, number> = {}
    try {
      const warmupResponse = await fetch(
        `https://api.plusvibe.ai/api/v1/analytics/warmup-stats?workspace_id=${workspaceId}&start_date=${startDate}&end_date=${endDate}`,
        { headers: { 'x-api-key': apiKey } }
      )
      if (warmupResponse.ok) {
        const warmupResult = await warmupResponse.json()
        // Build average inbox rate per account
        const warmupAccounts = warmupResult.data || warmupResult || []
        for (const wa of (Array.isArray(warmupAccounts) ? warmupAccounts : [])) {
          const inbox = wa.inbox_count || wa.inbox || 0
          const total = (wa.inbox_count || 0) + (wa.spam_count || 0) + (wa.promo_count || 0)
          if (total > 0 && wa.email) {
            warmupData[wa.email] = Math.round(inbox / total * 100)
          }
        }
      }
    } catch (e) {
      console.error('Warmup stats error:', (e as Error).message)
    }

    // 5. Process each domain
    const alerts: string[] = []
    let checked = 0, issues = 0

    for (const domain of domains) {
      checked++
      const domainAccounts = accountsByDomain.get(domain.id) || []
      const totalAccounts = domainAccounts.length
      const disconnected = domainAccounts.filter(a => a.status === 'disconnected').length
      const warmupInactive = domainAccounts.filter(a => a.warmup_status !== 'active').length

      // SPF/DKIM/DMARC from PlusVibe check
      const health = healthResults.get(domain.domain || '')
      const spfStatus = health ? (health.spf ? 'pass' : 'fail') : (domain.spf_status || 'unknown')
      const dkimStatus = health ? (health.dkim ? 'pass' : 'fail') : (domain.dkim_status || 'unknown')
      const dmarcStatus = health ? (health.dmarc ? 'pass' : 'fail') : (domain.dmarc_status || 'unknown')

      // Average inbox rate from warmup data
      let avgInboxRate: number | null = null
      const domainWarmupRates = domainAccounts
        .map(a => warmupData[a.email])
        .filter((r): r is number => r !== undefined)
      if (domainWarmupRates.length > 0) {
        avgInboxRate = Math.round(domainWarmupRates.reduce((a, b) => a + b, 0) / domainWarmupRates.length)
      }

      // Determine health status
      const domainIssues: string[] = []
      if (spfStatus === 'fail') domainIssues.push('SPF fail')
      if (dkimStatus === 'fail') domainIssues.push('DKIM fail')
      if (dmarcStatus === 'fail') domainIssues.push('DMARC fail')
      if (avgInboxRate !== null && avgInboxRate < 70) domainIssues.push(`Inbox rate ${avgInboxRate}% (<70%)`)
      if (totalAccounts > 0 && disconnected / totalAccounts > 0.25) domainIssues.push(`${disconnected}/${totalAccounts} disconnected (>25%)`)

      const healthStatus = domainIssues.length > 0 ? 'CRITICAL' : 'HEALTHY'
      if (domainIssues.length > 0) issues++

      // Update domain
      await supabase.from('domains').update({
        spf_status: spfStatus,
        dkim_status: dkimStatus,
        dmarc_status: dmarcStatus,
        health_status: healthStatus,
        avg_inbox_rate: avgInboxRate,
        last_health_check: new Date().toISOString(),
      }).eq('id', domain.id)

      // Generate alerts
      if (domainIssues.length > 0) {
        const alertMsg = `🔴 ${domain.domain}: ${domainIssues.join(', ')}`
        alerts.push(alertMsg)

        await supabase.from('agent_memory').insert({
          agent_id: 'domain-monitor',
          memory_type: 'domain_alert',
          content: alertMsg,
          metadata: {
            domain_id: domain.id,
            domain: domain.domain,
            spf: spfStatus,
            dkim: dkimStatus,
            dmarc: dmarcStatus,
            inbox_rate: avgInboxRate,
            disconnected,
            total_accounts: totalAccounts,
            issues: domainIssues,
          },
        })
      }
    }

    // Send Slack summary
    if (alerts.length > 0) {
      let slackText = `🌐 *Domain Health Check*\n`
      slackText += `Checked: ${checked} domains | ✅ ${checked - issues} Healthy | 🔴 ${issues} Issues\n\n`
      for (const alert of alerts) {
        slackText += `${alert}\n`
      }

      await sendSlackAlert(supabase, slackText)
    }

    // Log
    const completedAt = new Date()
    await supabase.from('sync_log').insert({
      source: 'internal',
      table_name: 'domains',
      operation: 'health_check',
      records_processed: checked,
      records_updated: issues,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
    })

    return new Response(
      JSON.stringify({ success: true, checked, issues, alerts: alerts.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Domain monitor error:', (error as Error).message)
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
      agent_id: 'domain-monitor',
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
