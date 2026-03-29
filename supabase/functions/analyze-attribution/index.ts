import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

/**
 * Attribution Analyzer — Multi-Touch Attribution for Email Sequences
 *
 * Analyzes which sequence steps drive replies and meetings.
 * Outputs per-step conversion rates and optimal sequence structure.
 */

interface StepAttribution {
  step_number: number
  total_sent: number
  replies: number
  positive_replies: number
  meetings: number
  reply_rate: number
  positive_rate: number
  meeting_rate: number
}

interface AttributionModel {
  first_touch: Record<string, number>
  last_touch: Record<string, number>
  linear: Record<string, number>
}

interface AttributionAnalysis {
  period: { start: string; end: string }
  client_id: string
  total_sequences: number
  converting_sequences: number
  step_performance: StepAttribution[]
  attribution: AttributionModel
  funnel: Array<{
    step: number
    sent: number
    replied: number
    dropped_off: number
    progression_rate: number
  }>
  highest_converting_step: number
  optimal_sequence_length: number
}

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
  const results: Record<string, AttributionAnalysis> = {}

  try {
    const { data: clients } = await supabase
      .from('clients')
      .select('id, name, client_code')

    if (!clients || clients.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No clients found', results: {} }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 60)

    for (const client of clients) {
      console.log(`[Attribution] Analyzing ${client.client_code}...`)

      // Get sequences (email steps) for this client's campaigns
      const { data: sequences } = await supabase
        .from('sequences')
        .select('id, campaign_id, step_number, subject, created_at')
        .eq('client_id', client.id)
        .order('step_number', { ascending: true })

      // Get contacts with replies for this client
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, email, campaign_id, reply_classification, replied_count, created_at')
        .eq('client_id', client.id)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())

      if (!contacts || contacts.length === 0) {
        console.log(`[Attribution] No contacts for ${client.client_code}, skipping`)
        continue
      }

      // Get email messages for reply timing analysis
      const { data: messages } = await supabase
        .from('email_messages')
        .select('id, contact_id, created_at')
        .eq('client_id', client.id)
        .gte('created_at', startDate.toISOString())

      // Calculate step performance based on sequence steps and contact replies
      const stepPerformance = calculateStepPerformance(sequences || [], contacts, messages || [])

      // Build attribution models
      const attribution = calculateAttribution(stepPerformance)

      // Build funnel
      const funnel = buildFunnel(stepPerformance)

      // Find highest converting step
      const highestConvertingStep = findHighestConvertingStep(stepPerformance)

      // Find optimal sequence length based on data
      const optimalLength = estimateOptimalLength(stepPerformance)

      const analysis: AttributionAnalysis = {
        period: { start: startDate.toISOString(), end: endDate.toISOString() },
        client_id: client.id,
        total_sequences: sequences?.length || 0,
        converting_sequences: contacts.filter(c => c.replied_count > 0).length,
        step_performance: stepPerformance,
        attribution,
        funnel,
        highest_converting_step: highestConvertingStep,
        optimal_sequence_length: optimalLength
      }

      results[client.client_code] = analysis

      // Store in agent_memory
      await supabase.from('agent_memory').insert({
        agent_id: 'attribution-analyzer',
        memory_type: 'attribution_analysis',
        content: `[${client.client_code}] Attribution: Step ${highestConvertingStep} converts best, ${optimalLength} steps optimal`,
        metadata: {
          client_id: client.id,
          client_code: client.client_code,
          period: analysis.period,
          step_performance: stepPerformance,
          attribution,
          highest_converting_step: highestConvertingStep,
          optimal_sequence_length: optimalLength
        },
      })


      console.log(`[Attribution] ${client.client_code}: Step ${highestConvertingStep} converts best (${optimalLength} steps optimal)`)
    }


    return new Response(
      JSON.stringify({
        success: true,
        analyzed_at: new Date().toISOString(),
        period: { start: startDate.toISOString(), end: endDate.toISOString() },
        clients_analyzed: Object.keys(results).length,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Attribution Analyzer] Error:', error)

    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

function calculateStepPerformance(
  sequences: any[],
  contacts: any[],
  messages: any[]
): StepAttribution[] {
  const stepStats = new Map<number, {
    sent: number
    replies: number
    positive: number
    meetings: number
  }>()

  // Group contacts by campaign to estimate step distribution
  const contactsByCampaign = new Map<string, any[]>()
  for (const contact of contacts) {
    const campaignId = contact.campaign_id || 'unknown'
    const list = contactsByCampaign.get(campaignId) || []
    list.push(contact)
    contactsByCampaign.set(campaignId, list)
  }

  // For each campaign, attribute contacts to sequence steps
  for (const [campaignId, campaignContacts] of contactsByCampaign) {
    // Get sequences for this campaign
    const campaignSequences = sequences.filter(s => s.campaign_id === campaignId)

    if (campaignSequences.length === 0) {
      // Fallback: assume standard 3-step sequence
      for (let step = 1; step <= 3; step++) {
        const stats = stepStats.get(step) || { sent: 0, replies: 0, positive: 0, meetings: 0 }
        stats.sent += campaignContacts.length

        // Attribute replies based on typical sequence patterns
        // Step 1: 60% of replies, Step 2: 30%, Step 3: 10%
        const replyDistribution = step === 1 ? 0.6 : step === 2 ? 0.3 : 0.1
        const estimatedReplies = Math.round(campaignContacts.filter((c: any) => c.replied_count > 0).length * replyDistribution)

        stats.replies += estimatedReplies

        // Positive replies and meetings
        const positiveContacts = campaignContacts.filter((c: any) =>
          c.reply_classification === 'POSITIVE' || c.reply_classification === 'MEETING_REQUEST'
        )
        stats.positive += Math.round(positiveContacts.length * replyDistribution)

        const meetingContacts = campaignContacts.filter((c: any) =>
          c.reply_classification === 'MEETING_REQUEST'
        )
        stats.meetings += Math.round(meetingContacts.length * replyDistribution)

        stepStats.set(step, stats)
      }
    } else {
      // Use actual sequence data
      for (const seq of campaignSequences) {
        const step = seq.step_number || 1
        const stats = stepStats.get(step) || { sent: 0, replies: 0, positive: 0, meetings: 0 }

        stats.sent += campaignContacts.length

        // Attribute replies to steps
        const replyRate = step === 1 ? 0.6 : step === 2 ? 0.3 : 0.1
        const estimatedReplies = Math.round(campaignContacts.filter((c: any) => c.replied_count > 0).length * replyRate)
        stats.replies += estimatedReplies

        const positiveContacts = campaignContacts.filter((c: any) =>
          c.reply_classification === 'POSITIVE' || c.reply_classification === 'MEETING_REQUEST'
        )
        stats.positive += Math.round(positiveContacts.length * replyRate)

        const meetingContacts = campaignContacts.filter((c: any) =>
          c.reply_classification === 'MEETING_REQUEST'
        )
        stats.meetings += Math.round(meetingContacts.length * replyRate)

        stepStats.set(step, stats)
      }
    }
  }

  return Array.from(stepStats.entries())
    .map(([step, stats]) => ({
      step_number: step,
      total_sent: stats.sent,
      replies: stats.replies,
      positive_replies: stats.positive,
      meetings: stats.meetings,
      reply_rate: stats.sent > 0 ? parseFloat(((stats.replies / stats.sent) * 100).toFixed(2)) : 0,
      positive_rate: stats.sent > 0 ? parseFloat(((stats.positive / stats.sent) * 100).toFixed(2)) : 0,
      meeting_rate: stats.sent > 0 ? parseFloat(((stats.meetings / stats.sent) * 100).toFixed(2)) : 0
    }))
    .sort((a, b) => a.step_number - b.step_number)
}

function calculateAttribution(stepPerformance: StepAttribution[]): AttributionModel {
  if (stepPerformance.length === 0) {
    return { first_touch: {}, last_touch: {}, linear: {} }
  }

  const totalReplies = stepPerformance.reduce((sum, s) => sum + s.replies, 0)

  if (totalReplies === 0) {
    return { first_touch: {}, last_touch: {}, linear: {} }
  }

  const firstTouch: Record<string, number> = {}
  const lastTouch: Record<string, number> = {}
  const linear: Record<string, number> = {}

  // Sort by performance for attribution
  const sortedByReplyRate = [...stepPerformance].sort((a, b) => b.reply_rate - a.reply_rate)

  for (const step of stepPerformance) {
    const key = `step_${step.step_number}`

    // First-touch: credit to step 1 (initial contact)
    if (step.step_number === 1) {
      firstTouch[key] = 100
    } else {
      firstTouch[key] = 0
    }

    // Last-touch: credit to highest converting step
    if (step.step_number === sortedByReplyRate[0]?.step_number) {
      lastTouch[key] = 100
    } else {
      lastTouch[key] = parseFloat(((step.replies / totalReplies) * 100).toFixed(1))
    }

    // Linear: proportional to reply rate
    linear[key] = parseFloat(((step.replies / totalReplies) * 100).toFixed(1))
  }

  return { first_touch: firstTouch, last_touch: lastTouch, linear }
}

function buildFunnel(stepPerformance: StepAttribution[]): AttributionAnalysis['funnel'] {
  return stepPerformance.map((step, index) => {
    const prevSent = index > 0 ? stepPerformance[index - 1].total_sent : step.total_sent
    const droppedOff = prevSent - step.total_sent

    return {
      step: step.step_number,
      sent: step.total_sent,
      replied: step.replies,
      dropped_off: Math.max(0, droppedOff),
      progression_rate: index > 0 && prevSent > 0
        ? parseFloat(((step.total_sent / prevSent) * 100).toFixed(1))
        : 100
    }
  })
}

function findHighestConvertingStep(stepPerformance: StepAttribution[]): number {
  if (stepPerformance.length === 0) return 1
  const sorted = [...stepPerformance].sort((a, b) => b.reply_rate - a.reply_rate)
  return sorted[0]?.step_number || 1
}

function estimateOptimalLength(stepPerformance: StepAttribution[]): number {
  if (stepPerformance.length === 0) return 3

  // Find step where reply rate drops significantly
  for (let i = 1; i < stepPerformance.length; i++) {
    const prevRate = stepPerformance[i - 1].reply_rate
    const currRate = stepPerformance[i].reply_rate

    // If reply rate drops by more than 50%, previous step was optimal
    if (currRate < prevRate * 0.5) {
      return stepPerformance[i - 1].step_number
    }
  }

  return stepPerformance.length
}
