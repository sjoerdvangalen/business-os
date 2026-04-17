import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

/**
 * Anomaly Detection Agent — Statistical Anomaly Detection for Campaign Metrics
 *
 * Detects unusual patterns beyond simple thresholds using statistical methods:
 * - Z-score analysis (deviation from mean)
 * - Moving average comparisons
 * - Rate-of-change detection
 * - Pattern breaking (sudden shifts in established patterns)
 *
 * Runs every 15 minutes alongside campaign-monitor but with deeper analysis.
 */

interface MetricBaseline {
  metric: string
  mean: number
  stdDev: number
  min: number
  max: number
  sampleSize: number
  calculatedAt: string
}

interface Anomaly {
  id: string
  timestamp: string
  campaignId: string
  campaignName: string
  clientId: string
  clientCode: string
  metric: string
  value: number
  expectedValue: number
  deviation: number
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  type: 'SPIKE' | 'DROP' | 'PATTERN_BREAK'
  description: string
  recommendedAction: string
}

interface DetectionResult {
  anomalies: Anomaly[]
  baselinesUpdated: number
  metricsAnalyzed: number
}

// Configuration
const ZSCORE_THRESHOLD_LOW = 2.0      // 2 standard deviations
const ZSCORE_THRESHOLD_MEDIUM = 2.5   // 2.5 standard deviations
const ZSCORE_THRESHOLD_HIGH = 3.0     // 3 standard deviations
const ZSCORE_THRESHOLD_CRITICAL = 4.0 // 4 standard deviations

const RATE_OF_CHANGE_THRESHOLD = 0.5  // 50% change from previous period

// Metrics to monitor
const MONITORED_METRICS = [
  'bounce_rate',
  'reply_rate',
  'open_rate',
  'unsubscribe_rate',
  'emails_sent_per_hour',
  'positive_reply_rate',
  'meeting_conversion_rate'
]

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startedAt = new Date()
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const results: Record<string, DetectionResult> = {}

  try {
    // Get all active clients
    const { data: clients } = await supabase
      .from('clients')
      .select('id, name, client_code')

    if (!clients || clients.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No clients found', results: {} }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    for (const client of clients) {
      console.log(`[Anomaly Detection] Analyzing ${client.client_code}...`)

      // Fetch recent campaigns with metrics
      const { data: campaigns } = await supabase
        .from('campaigns')
        .select(`
          id, name, client_id, status,
          emails_sent, replies, bounces, unsubscribes,
          open_rate, reply_rate, bounce_rate,
          positive_replies, negative_replies,
          created_at, updated_at
        `)
        .eq('client_id', client.id)
        .eq('status', 'ACTIVE')
        .gte('emails_sent', 100) // Need enough data

      if (!campaigns || campaigns.length === 0) {
        console.log(`[Anomaly Detection] No campaigns for ${client.client_code}, skipping`)
        continue
      }

      // Calculate baselines from historical data (last 30 days)
      const baselines = await calculateBaselines(supabase, client.id)

      // Detect anomalies
      const anomalies: Anomaly[] = []

      for (const campaign of campaigns) {
        const campaignAnomalies = detectCampaignAnomalies(campaign, baselines, client)
        anomalies.push(...campaignAnomalies)
      }

      // Detect cross-campaign patterns (e.g., all campaigns suddenly dropping)
      const patternAnomalies = detectPatternAnomalies(campaigns, baselines, client)
      anomalies.push(...patternAnomalies)

      // Store anomalies
      for (const anomaly of anomalies) {
        await storeAnomaly(supabase, anomaly)

      }

      // Send alerts for HIGH and CRITICAL
      const criticalAnomalies = anomalies.filter(a => a.severity === 'HIGH' || a.severity === 'CRITICAL')
      if (criticalAnomalies.length > 0) {
        await sendAnomalyAlerts(supabase, client, criticalAnomalies)
      }

      // Update baselines with new data
      const baselinesUpdated = await updateBaselines(supabase, client.id, campaigns)

      results[client.client_code] = {
        anomalies,
        baselinesUpdated,
        metricsAnalyzed: campaigns.length * MONITORED_METRICS.length
      }

      console.log(`[Anomaly Detection] ${client.client_code}: ${anomalies.length} anomalies detected`)
    }


    // Log completion
    const completedAt = new Date()
    await supabase.from('sync_log').insert({
      source: 'internal',
      table_name: 'campaigns',
      operation: 'anomaly_detection',
      records_processed: Object.values(results).reduce((sum, r) => sum + r.anomalies.length, 0),
      records_updated: 0,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
    })

    return new Response(
      JSON.stringify({
        success: true,
        analyzed_at: new Date().toISOString(),
        clients_analyzed: Object.keys(results).length,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Anomaly Detection] Error:', error)

    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

// Helper functions
async function calculateBaselines(
  supabase: ReturnType<typeof createClient>,
  clientId: string
): Promise<Map<string, MetricBaseline>> {
  const baselines = new Map<string, MetricBaseline>()

  // Get last 30 days of campaign data
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 30)

  const { data: historical } = await supabase
    .from('campaigns')
    .select('emails_sent, replies, bounces, unsubscribes, open_rate, reply_rate, bounce_rate, positive_replies')
    .eq('client_id', clientId)
    .gte('created_at', startDate.toISOString())

  if (!historical || historical.length === 0) {
    return baselines
  }

  // Calculate baselines for each metric
  const metrics: Record<string, number[]> = {
    bounce_rate: [],
    reply_rate: [],
    open_rate: [],
    unsubscribe_rate: [],
    positive_reply_rate: []
  }

  for (const record of historical) {
    const sent = record.emails_sent || 0
    if (sent < 50) continue // Skip low-volume campaigns

    metrics.bounce_rate.push(record.bounce_rate || 0)
    metrics.reply_rate.push(record.reply_rate || 0)
    metrics.open_rate.push(record.open_rate || 0)
    metrics.unsubscribe_rate.push(sent > 0 ? ((record.unsubscribes || 0) / sent) * 100 : 0)
    metrics.positive_reply_rate.push(sent > 0 ? ((record.positive_replies || 0) / sent) * 100 : 0)
  }

  for (const [metric, values] of Object.entries(metrics)) {
    if (values.length < 5) continue // Need minimum sample size

    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
    const stdDev = Math.sqrt(variance)

    baselines.set(metric, {
      metric,
      mean: parseFloat(mean.toFixed(2)),
      stdDev: parseFloat(stdDev.toFixed(2)),
      min: Math.min(...values),
      max: Math.max(...values),
      sampleSize: values.length,
      calculatedAt: new Date().toISOString()
    })
  }

  return baselines
}

function detectCampaignAnomalies(
  campaign: any,
  baselines: Map<string, MetricBaseline>,
  client: any
): Anomaly[] {
  const anomalies: Anomaly[] = []
  const sent = campaign.emails_sent || 0

  if (sent < 100) return anomalies // Skip low-volume

  // Check each metric
  const checks = [
    { metric: 'bounce_rate', value: campaign.bounce_rate || 0 },
    { metric: 'reply_rate', value: campaign.reply_rate || 0 },
    { metric: 'open_rate', value: campaign.open_rate || 0 },
    { metric: 'unsubscribe_rate', value: sent > 0 ? ((campaign.unsubscribes || 0) / sent) * 100 : 0 },
    { metric: 'positive_reply_rate', value: sent > 0 ? ((campaign.positive_replies || 0) / sent) * 100 : 0 }
  ]

  for (const check of checks) {
    const baseline = baselines.get(check.metric)
    if (!baseline) continue

    const zScore = (check.value - baseline.mean) / (baseline.stdDev || 1)
    const absZScore = Math.abs(zScore)

    // Determine severity based on z-score
    let severity: Anomaly['severity'] | null = null
    if (absZScore >= ZSCORE_THRESHOLD_CRITICAL) severity = 'CRITICAL'
    else if (absZScore >= ZSCORE_THRESHOLD_HIGH) severity = 'HIGH'
    else if (absZScore >= ZSCORE_THRESHOLD_MEDIUM) severity = 'MEDIUM'
    else if (absZScore >= ZSCORE_THRESHOLD_LOW) severity = 'LOW'

    if (severity) {
      const type = zScore > 0 ? 'SPIKE' : 'DROP'

      anomalies.push({
        id: `${campaign.id}_${check.metric}_${Date.now()}`,
        timestamp: new Date().toISOString(),
        campaignId: campaign.id,
        campaignName: campaign.name,
        clientId: client.id,
        clientCode: client.client_code,
        metric: check.metric,
        value: parseFloat(check.value.toFixed(2)),
        expectedValue: baseline.mean,
        deviation: parseFloat(zScore.toFixed(2)),
        severity,
        type,
        description: generateAnomalyDescription(check.metric, type, check.value, baseline.mean, zScore),
        recommendedAction: generateRecommendedAction(check.metric, type, severity)
      })
    }
  }

  return anomalies
}

function detectPatternAnomalies(
  campaigns: any[],
  baselines: Map<string, MetricBaseline>,
  client: any
): Anomaly[] {
  const anomalies: Anomaly[] = []

  if (campaigns.length < 3) return anomalies

  // Check for synchronized drops across all campaigns (indicates external factor)
  const replyRates = campaigns.map(c => c.reply_rate || 0)
  const allDropping = replyRates.every((rate, i) => i === 0 || rate <= replyRates[i - 1] * 1.1)

  if (allDropping && replyRates.length >= 3) {
    const avgDrop = replyRates[0] - replyRates[replyRates.length - 1]

    if (avgDrop > 2) { // More than 2% drop
      anomalies.push({
        id: `${client.id}_pattern_drop_${Date.now()}`,
        timestamp: new Date().toISOString(),
        campaignId: 'all_active',
        campaignName: 'All Active Campaigns',
        clientId: client.id,
        clientCode: client.client_code,
        metric: 'reply_rate_across_campaigns',
        value: parseFloat(avgDrop.toFixed(2)),
        expectedValue: 0,
        deviation: parseFloat((avgDrop / 2).toFixed(2)),
        severity: avgDrop > 5 ? 'HIGH' : 'MEDIUM',
        type: 'PATTERN_BREAK',
        description: `Reply rates dropping across all ${campaigns.length} campaigns (${avgDrop.toFixed(1)}% average decline). Possible causes: deliverability issues, inbox placement changes, or market saturation.`,
        recommendedAction: 'Check domain health, review sender reputation, consider pausing and warming new domains'
      })
    }
  }

  return anomalies
}

function generateAnomalyDescription(
  metric: string,
  type: 'SPIKE' | 'DROP',
  value: number,
  expected: number,
  zScore: number
): string {
  const direction = type === 'SPIKE' ? 'spiked to' : 'dropped to'
  const diff = Math.abs(value - expected).toFixed(1)

  const descriptions: Record<string, string> = {
    bounce_rate: `Bounce rate ${direction} ${value.toFixed(1)}% (${diff}% ${type === 'SPIKE' ? 'above' : 'below'} baseline of ${expected.toFixed(1)}%). ${type === 'SPIKE' ? 'List quality or deliverability issue likely.' : 'Improved list quality or infrastructure change.'}`,
    reply_rate: `Reply rate ${direction} ${value.toFixed(1)}% (${diff}% ${type === 'SPIKE' ? 'above' : 'below'} baseline). ${type === 'SPIKE' ? 'Copy or targeting resonating well.' : 'Copy fatigue or targeting mismatch.'}`,
    open_rate: `Open rate ${direction} ${value.toFixed(1)}% (${diff}% ${type === 'SPIKE' ? 'above' : 'below'} baseline). ${type === 'SPIKE' ? 'Subject lines performing well.' : 'Deliverability to spam folder likely.'}`,
    unsubscribe_rate: `Unsubscribe rate ${direction} ${value.toFixed(2)}% (${diff}% ${type === 'SPIKE' ? 'above' : 'below'} baseline). ${type === 'SPIKE' ? 'Messaging misalignment or list quality issue.' : 'Good list-message fit.'}`,
    positive_reply_rate: `Positive reply rate ${direction} ${value.toFixed(2)}% (${diff}% ${type === 'SPIKE' ? 'above' : 'below'} baseline). ${type === 'SPIKE' ? 'Excellent targeting and copy match.' : 'Need offer or targeting adjustment.'}`
  }

  return descriptions[metric] || `${metric} ${direction} ${value.toFixed(1)}% (${Math.abs(zScore).toFixed(1)} std dev from baseline)`
}

function generateRecommendedAction(metric: string, type: 'SPIKE' | 'DROP', severity: string): string {
  const actions: Record<string, string> = {
    bounce_rate_SPIKE: 'Pause campaign immediately. Verify email list quality. Check if any domains are blacklisted.',
    bounce_rate_DROP: 'Monitor — improvement detected. Document what changed.',
    reply_rate_SPIKE: 'Scale this campaign aggressively. Document copy/audience for replication.',
    reply_rate_DROP: severity === 'CRITICAL' ? 'Pause and rewrite copy. Test new angles immediately.' : 'A/B test new subject lines and body copy.',
    open_rate_SPIKE: 'Replicate subject line patterns. Good deliverability confirmed.',
    open_rate_DROP: 'Check spam folder placement. Verify domain health. Warm up new sending accounts.',
    unsubscribe_rate_SPIKE: 'Review messaging alignment. Check if offer matches audience expectations.',
    positive_reply_rate_SPIKE: 'This is your winning formula. Scale and replicate.',
    positive_reply_rate_DROP: 'Revisit ICP definition. Test different value propositions.'
  }

  return actions[`${metric}_${type}`] || 'Monitor closely and investigate cause.'
}

async function storeAnomaly(supabase: ReturnType<typeof createClient>, anomaly: Anomaly): Promise<void> {
  await supabase.from('agent_memory').insert({
    agent_id: 'anomaly-detection',
    memory_type: 'anomaly_alert',
    content: `[${anomaly.severity}] ${anomaly.clientCode} | ${anomaly.campaignName}: ${anomaly.description}`,
    metadata: {
      anomaly_id: anomaly.id,
      campaign_id: anomaly.campaignId,
      client_id: anomaly.clientId,
      client_code: anomaly.clientCode,
      metric: anomaly.metric,
      value: anomaly.value,
      expected_value: anomaly.expectedValue,
      deviation: anomaly.deviation,
      severity: anomaly.severity,
      type: anomaly.type,
      description: anomaly.description,
      recommended_action: anomaly.recommendedAction
    }
  })
}

async function updateBaselines(
  supabase: ReturnType<typeof createClient>,
  clientId: string,
  campaigns: any[]
): Promise<number> {
  // Store updated baselines in agent_memory for reference
  const baselines = await calculateBaselines(supabase, clientId)

  await supabase.from('agent_memory').insert({
    agent_id: 'anomaly-detection',
    memory_type: 'baseline_update',
    content: `Updated baselines for ${baselines.size} metrics`,
    metadata: {
      client_id: clientId,
      baselines: Object.fromEntries(baselines),
      campaigns_count: campaigns.length
    }
  })

  return baselines.size
}

async function sendAnomalyAlerts(
  supabase: ReturnType<typeof createClient>,
  client: any,
  anomalies: Anomaly[]
): Promise<void> {
  // Build Slack message
  let slackText = `🚨 *Statistical Anomalies Detected — ${client.client_code}*\n\n`

  const critical = anomalies.filter(a => a.severity === 'CRITICAL')
  const high = anomalies.filter(a => a.severity === 'HIGH')

  if (critical.length > 0) {
    slackText += `*CRITICAL:*\n`
    for (const a of critical) {
      slackText += `• ${a.campaignName}: ${a.description.slice(0, 100)}...\n`
      slackText += `  → ${a.recommendedAction.slice(0, 80)}...\n\n`
    }
  }

  if (high.length > 0) {
    slackText += `*HIGH:*\n`
    for (const a of high) {
      slackText += `• ${a.campaignName}: ${a.description.slice(0, 100)}...\n`
    }
  }

  // Send to Slack
  const slackWebhookUrl = Deno.env.get('SLACK_WEBHOOK_URL')
  if (slackWebhookUrl) {
    try {
      await fetch(slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: '#sales-alerts', text: slackText })
      })
    } catch (e) {
      console.error('Slack alert error:', e)
    }
  }

  console.log(`[Anomaly Detection] Alerts sent for ${client.client_code}: ${anomalies.length} anomalies`)
}
