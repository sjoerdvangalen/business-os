import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Build A-Leads config from synthesis + cell dimensions
function buildAleadsConfig(
  synthesis: Record<string, unknown>,
  cell: Record<string, unknown>
): Record<string, unknown> {
  const icp = (synthesis.icp_segments as Array<Record<string, unknown>>)?.find(
    s => s.key === cell.icp_key || s.name === cell.icp_key
  )
  const fc = ((synthesis.qualification_framework as Record<string, unknown>)?.firmographic_constraints as Record<string, unknown>) ?? {}
  const profiles = (synthesis.keyword_profiles as Record<string, unknown>) ?? {}
  const profile = profiles[cell.icp_key as string] as Record<string, unknown> | undefined

  const industryKeywords = profile?.industry_keywords
    ? (profile.industry_keywords as string).split(',').map(k => k.trim()).filter(Boolean)
    : (icp?.industries as string[] ?? [])

  const jobTitleKeywords = profile?.job_title_keywords
    ? (profile.job_title_keywords as string).split(',').map(k => k.trim()).filter(Boolean)
    : []

  const geoToHqLocation = (geo: unknown): string[] => {
    const map: Record<string, string[]> = {
      NL: ['netherlands'], BE: ['belgium'], NLBE: ['netherlands', 'belgium'],
      DACH: ['germany', 'austria', 'switzerland'], UK: ['united kingdom'],
      DE: ['germany'], AT: ['austria'], CH: ['switzerland'],
    }
    if (Array.isArray(geo)) return geo.flatMap((g: string) => map[g] ?? [g.toLowerCase()])
    return map[geo as string] ?? [(geo as string ?? '').toLowerCase()]
  }

  const employeeRangeToSizeCodes = (range: string): string[] => {
    if (!range) return ['3', '4', '5']
    const parts = range.split('-').map(s => parseInt(s.replace(/[k+]/gi, '000')))
    const min = parts[0] || 0
    const max = parts[1] || Infinity
    const ranges: [number, number, string][] = [
      [1, 10, '1'], [11, 20, '2'], [21, 50, '3'], [51, 100, '4'],
      [101, 200, '5'], [201, 500, '6'], [501, 1000, '7'], [1001, 5000, '8'], [5001, 999999, '9'],
    ]
    const codes = ranges.filter(([lo, hi]) => min <= hi && max >= lo).map(([, , c]) => c)
    return codes.length ? codes : ['3', '4', '5']
  }

  return {
    categories_and_keywords: industryKeywords,
    job_title_keywords: jobTitleKeywords,
    hq_location: geoToHqLocation(cell.geo ?? fc.geos),
    mapped_company_size: employeeRangeToSizeCodes(icp?.employee_range as string ?? ''),
    excluded_domains: [],
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

  try {
    const { client_id } = await req.json() as { client_id: string }

    if (!client_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing client_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Read synthesis from gtm_strategies (primary source)
    const { data: strategyRow, error: strategyError } = await supabase
      .from('gtm_strategies')
      .select('id, synthesis, status')
      .eq('client_id', client_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (strategyError || !strategyRow) {
      return new Response(
        JSON.stringify({ success: false, error: `GTM strategy not found: ${strategyError?.message}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const synthesis = strategyRow.synthesis as Record<string, unknown>
    const strategyId = strategyRow.id

    if (!synthesis) {
      return new Response(
        JSON.stringify({ success: false, error: 'Strategy synthesis not yet available' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const matrixSeed = (synthesis.campaign_matrix_seed as Array<Record<string, unknown>>) ?? []
    const validCells = matrixSeed.filter(c => c.valid === true)

    if (validCells.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No valid cells in campaign_matrix_seed' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Pre-index synthesis lookups for efficiency
    const personaMap = (synthesis.persona_map as Array<Record<string, unknown>>) ?? []
    const verticalMap = (synthesis.vertical_map as Array<Record<string, unknown>>) ?? []
    const icpSegments = (synthesis.icp_segments as Array<Record<string, unknown>>) ?? []
    const valuePropFormula = (synthesis.value_prop_formula as Record<string, unknown>) ?? {}
    const qualificationFramework = (synthesis.qualification_framework as Record<string, unknown>) ?? {}
    const verticalCustomerTerms = (synthesis.vertical_customer_terms as Record<string, unknown>) ?? {}
    const verticalExpertTerms = (synthesis.vertical_expert_terms as Record<string, unknown>) ?? {}

    let seeded = 0
    let skipped = 0
    const errors: string[] = []

    for (const cell of validCells) {
      const cellCode = cell.cell_code as string
      const solutionKey = cell.solution_key as string
      const icpKey = cell.icp_key as string
      const verticalKey = cell.vertical_key as string
      const personaKey = cell.persona_key as string
      const geo = cell.geo as string

      if (!cellCode || !solutionKey || !icpKey || !verticalKey || !personaKey) {
        errors.push(`Cell missing required keys: ${JSON.stringify(cell).substring(0, 100)}`)
        skipped++
        continue
      }

      // Freeze snapshot at creation — immutable after this point
      const snapshot = {
        created_at: new Date().toISOString(),
        persona: personaMap.find(p => p.key === personaKey) ?? null,
        vertical: verticalMap.find(v => v.vertical_key === verticalKey) ?? null,
        icp_segment: icpSegments.find(s => s.key === icpKey || s.name === icpKey) ?? null,
        value_prop_formula: valuePropFormula,
        qualification: qualificationFramework,
      }

      // Skeleton brief — messaging fields filled by gtm-campaign-cell-enrich later
      const brief = {
        target_job_title_families: (cell.target_job_title_families as string[] ?? []),
        trigger_event_classes: (cell.trigger_event_classes as string[] ?? []),
        aleads_config: buildAleadsConfig(synthesis, cell),
        customer_term: verticalCustomerTerms[verticalKey] ?? null,
        expert_term: verticalExpertTerms[verticalKey] ?? null,
        geo,
        // Messaging fields — populated by gtm-campaign-cell-enrich after sourcing approval:
        hook_frameworks: null,
        cta_directions: null,
        trigger_alignment: null,
        signal_to_pain: null,
        proof_angle: null,
        objection_angle: null,
      }

      // Derive campaign_archetype from matrix seed entry or default to matrix_driven
      const cellArchetype = (cell.campaign_archetype as string) ?? 'matrix_driven'

      const { error: upsertError } = await supabase
        .from('campaign_cells')
        .upsert({
          client_id,
          strategy_id: strategyId,
          cell_code: cellCode,
          cell_slug: cellCode.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
          solution_key: solutionKey,
          icp_key: icpKey,
          vertical_key: verticalKey,
          persona_key: personaKey,
          solution_name: solutionKey,  // readable name — enriched if solutions[] available
          segment_name: icpKey,
          persona_name: personaKey,
          language: geo?.startsWith('NL') || geo?.startsWith('BE') ? 'NL' : 'EN',
          region: geo ?? 'global',
          status: 'sourcing_pending',
          campaign_archetype: cellArchetype,
          signal_tier: 3,  // baseline — sourcing/enrichment upgrades to Tier 2 or 1
          snapshot,
          brief,
        }, { onConflict: 'cell_code,client_id' })

      if (upsertError) {
        errors.push(`Failed to upsert ${cellCode}: ${upsertError.message}`)
        skipped++
      } else {
        seeded++
      }
    }

    console.log(`[${requestId}] Cell seed for client ${client_id}: ${seeded} seeded, ${skipped} skipped, ${errors.length} errors`)

    if (errors.length > 0) {
      console.error(`[${requestId}] Seed errors:`, errors.join(' | '))
    }

    return new Response(
      JSON.stringify({
        success: true,
        client_id,
        strategy_id: strategyId,
        total_valid: validCells.length,
        seeded,
        skipped,
        errors: errors.length > 0 ? errors : undefined,
        request_id: requestId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const msg = (error as Error).message
    console.error(`[${requestId}] Unhandled error:`, msg)
    return new Response(
      JSON.stringify({ success: false, error: msg, request_id: requestId }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
