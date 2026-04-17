import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

/**
 * ICP Analyzer — Dynamic Ideal Customer Profile Optimization
 *
 * Runs weekly (via pg_cron) to analyze which lead characteristics
 * correlate with positive outcomes (replies, meetings, interest).
 *
 * Outputs:
 * - Updates clients.icp_profile JSONB
 * - Generates lead scoring recommendations
 */

interface ICPAnalysis {
  period: { start: string; end: string }
  total_leads: number
  converting_leads: number
  conversion_rate: number

  // Company characteristics
  top_industries: Array<{ value: string; count: number; conversion_rate: number }>
  top_company_categories: Array<{ value: string; count: number; conversion_rate: number }>
  company_size_distribution: Array<{ range: string; count: number; conversion_rate: number }>

  // Geography
  top_countries: Array<{ value: string; count: number; conversion_rate: number }>
  top_cities: Array<{ value: string; count: number; conversion_rate: number }>

  // Person characteristics
  top_positions: Array<{ value: string; count: number; conversion_rate: number }>
  top_departments: Array<{ value: string; count: number; conversion_rate: number }>

  // Temporal patterns
  best_days_to_send: Array<{ day: string; count: number; conversion_rate: number }>
  best_times_to_send: Array<{ hour: number; count: number; conversion_rate: number }>

  // Source performance
  lead_source_performance: Array<{ source: string; count: number; conversion_rate: number }>

  // Recommendations
  recommendations: string[]
  updated_icp: {
    primary_industries: string[]
    target_company_sizes: string[]
    target_positions: string[]
    target_countries: string[]
    ideal_lead_sources: string[]
  }
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
  const results: Record<string, ICPAnalysis> = {}

  try {
    // Get all active clients
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id, name, client_code')

    if (clientsError) {
      console.error('[ICP] Error fetching clients:', clientsError)
      throw clientsError
    }

    if (!clients || clients.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No clients found', results: {} }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Analysis window: last 30 days
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 30)

    for (const client of clients) {
      console.log(`[ICP] Analyzing ${client.client_code}...`)

      // Fetch contacts with outcomes for this client
      const { data: leads } = await supabase
        .from('contacts')
        .select(`
          id, company_name, industry, department, position, city, state, country,
          lead_source, lead_score, created_at,
          reply_classification, lead_status, replied_count, campaign_id
        `)
        .eq('client_id', client.id)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())

      if (!leads || leads.length === 0) {
        console.log(`[ICP] No leads for ${client.client_code}, skipping`)
        continue
      }

      // Define conversion: replied with positive/neutral/meeting request
      const convertingLeads = leads.filter(l =>
        l.replied_count > 0 &&
        ['POSITIVE', 'NEUTRAL', 'MEETING_REQUEST'].includes(l.reply_classification)
      )

      const totalLeads = leads.length
      const convertingCount = convertingLeads.length
      const conversionRate = totalLeads > 0 ? (convertingCount / totalLeads) * 100 : 0

      // Aggregate by characteristics
      const analysis: ICPAnalysis = {
        period: { start: startDate.toISOString(), end: endDate.toISOString() },
        total_leads: totalLeads,
        converting_leads: convertingCount,
        conversion_rate: parseFloat(conversionRate.toFixed(2)),

        top_industries: aggregateByField(leads, convertingLeads, 'industry'),
        top_company_categories: [], // Would need company.category join
        company_size_distribution: [], // Would need company.employee_count

        top_countries: aggregateByField(leads, convertingLeads, 'country'),
        top_cities: aggregateByField(leads, convertingLeads, 'city'),

        top_positions: aggregateByField(leads, convertingLeads, 'position'),
        top_departments: aggregateByField(leads, convertingLeads, 'department'),

        best_days_to_send: analyzeByDayOfWeek(leads, convertingLeads),
        best_times_to_send: analyzeByHour(leads, convertingLeads),

        lead_source_performance: aggregateByField(leads, convertingLeads, 'lead_source'),

        recommendations: generateRecommendations(leads, convertingLeads),
        updated_icp: {
          primary_industries: extractTopValues(aggregateByField(leads, convertingLeads, 'industry'), 3),
          target_company_sizes: [],
          target_positions: extractTopValues(aggregateByField(leads, convertingLeads, 'position'), 5),
          target_countries: extractTopValues(aggregateByField(leads, convertingLeads, 'country'), 3),
          ideal_lead_sources: extractTopValues(aggregateByField(leads, convertingLeads, 'lead_source'), 3),
        }
      }

      results[client.client_code] = analysis

      // Store analysis in agent_memory
      await supabase.from('agent_memory').insert({
        agent_id: 'icp-analyzer',
        memory_type: 'icp_analysis',
        content: `[${client.client_code}] ICP Analysis: ${convertingCount}/${totalLeads} (${conversionRate.toFixed(1)}%) converting`,
        metadata: {
          client_id: client.id,
          client_code: client.client_code,
          period: analysis.period,
          conversion_rate: analysis.conversion_rate,
          total_leads: analysis.total_leads,
          converting_leads: analysis.converting_leads,
          top_industries: analysis.top_industries.slice(0, 5),
          top_positions: analysis.top_positions.slice(0, 5),
          recommendations: analysis.recommendations,
          updated_icp: analysis.updated_icp
        }
      })


      console.log(`[ICP] ${client.client_code}: ${convertingCount}/${totalLeads} (${conversionRate.toFixed(1)}%) converting`)
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
    console.error('[ICP Analyzer] Error:', error)

    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

// Helper functions
function aggregateByField(
  allLeads: any[],
  convertingLeads: any[],
  field: string
): Array<{ value: string; count: number; conversion_rate: number }> {
  const counts = new Map<string, { total: number; converting: number }>()

  for (const lead of allLeads) {
    const value = lead[field] || 'unknown'
    const current = counts.get(value) || { total: 0, converting: 0 }
    current.total++
    counts.set(value, current)
  }

  for (const lead of convertingLeads) {
    const value = lead[field] || 'unknown'
    const current = counts.get(value) || { total: 0, converting: 0 }
    current.converting++
    counts.set(value, current)
  }

  return Array.from(counts.entries())
    .map(([value, stats]) => ({
      value,
      count: stats.total,
      conversion_rate: parseFloat(((stats.converting / stats.total) * 100).toFixed(1))
    }))
    .filter(item => item.count >= 5) // Min 5 leads for statistical relevance
    .sort((a, b) => b.conversion_rate - a.conversion_rate)
    .slice(0, 10)
}

function analyzeByDayOfWeek(
  allLeads: any[],
  convertingLeads: any[]
): Array<{ day: string; count: number; conversion_rate: number }> {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const counts = new Map<string, { total: number; converting: number }>()

  for (const lead of allLeads) {
    const day = days[new Date(lead.created_at).getDay()]
    const current = counts.get(day) || { total: 0, converting: 0 }
    current.total++
    counts.set(day, current)
  }

  for (const lead of convertingLeads) {
    const day = days[new Date(lead.created_at).getDay()]
    const current = counts.get(day) || { total: 0, converting: 0 }
    current.converting++
    counts.set(day, current)
  }

  return days
    .map(day => {
      const stats = counts.get(day) || { total: 0, converting: 0 }
      return {
        day,
        count: stats.total,
        conversion_rate: stats.total > 0 ? parseFloat(((stats.converting / stats.total) * 100).toFixed(1)) : 0
      }
    })
    .sort((a, b) => b.conversion_rate - a.conversion_rate)
}

function analyzeByHour(
  allLeads: any[],
  convertingLeads: any[]
): Array<{ hour: number; count: number; conversion_rate: number }> {
  const counts = new Map<number, { total: number; converting: number }>()

  for (const lead of allLeads) {
    const hour = new Date(lead.created_at).getHours()
    const current = counts.get(hour) || { total: 0, converting: 0 }
    current.total++
    counts.set(hour, current)
  }

  for (const lead of convertingLeads) {
    const hour = new Date(lead.created_at).getHours()
    const current = counts.get(hour) || { total: 0, converting: 0 }
    current.converting++
    counts.set(hour, current)
  }

  return Array.from({ length: 24 }, (_, hour) => {
    const stats = counts.get(hour) || { total: 0, converting: 0 }
    return {
      hour,
      count: stats.total,
      conversion_rate: stats.total > 0 ? parseFloat(((stats.converting / stats.total) * 100).toFixed(1)) : 0
    }
  }).sort((a, b) => b.conversion_rate - a.conversion_rate)
}

function extractTopValues(
  items: Array<{ value: string; count: number; conversion_rate: number }>,
  limit: number
): string[] {
  return items
    .filter(item => item.conversion_rate > 0)
    .slice(0, limit)
    .map(item => item.value)
}

function generateRecommendations(allLeads: any[], convertingLeads: any[]): string[] {
  const recommendations: string[] = []

  const conversionRate = convertingLeads.length / allLeads.length

  if (conversionRate < 0.02) {
    recommendations.push("Conversion rate below 2% — consider refreshing email copy or tightening ICP")
  }

  if (conversionRate > 0.08) {
    recommendations.push("Strong conversion rate (>8%) — scale this profile aggressively")
  }

  // Day analysis
  const dayStats = analyzeByDayOfWeek(allLeads, convertingLeads)
  const bestDay = dayStats[0]
  const worstDay = dayStats[dayStats.length - 1]
  if (bestDay.conversion_rate > worstDay.conversion_rate * 2) {
    recommendations.push(`Best performing day: ${bestDay.day} (${bestDay.conversion_rate}% vs ${worstDay.conversion_rate}% on ${worstDay.day})`)
  }

  // Hour analysis
  const hourStats = analyzeByHour(allLeads, convertingLeads)
  const bestHour = hourStats[0]
  if (bestHour.count >= 10) {
    recommendations.push(`Optimal send time: ${bestHour.hour}:00 (${bestHour.conversion_rate}% conversion)`)
  }

  return recommendations
}
