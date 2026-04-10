import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const ALEADS_API_KEY = Deno.env.get('ALEADS_API_KEY') ?? ''
const ALEADS_BASE_URL = 'https://api.a-leads.co/v1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ALeadsCompany {
  id?: string
  name: string
  domain?: string
  website?: string
  industry?: string
  employee_count?: number
  employee_range?: string
  country?: string
  city?: string
  linkedin_url?: string
}

interface ALeadsContact {
  id?: string
  first_name?: string
  last_name?: string
  full_name?: string
  email?: string
  title?: string
  linkedin_url?: string
  company_id?: string
  company_name?: string
  company_domain?: string
}

// Parse employee range string to min/max numbers
function parseEmployeeRange(range: string): { min?: number; max?: number } {
  if (!range) return {}
  const match = range.match(/(\d+)\s*[-–]\s*(\d+)/)
  if (match) return { min: parseInt(match[1]), max: parseInt(match[2]) }
  const singleMatch = range.match(/(\d+)\+/)
  if (singleMatch) return { min: parseInt(singleMatch[1]) }
  return {}
}

// Parse geo string to country codes
function parseGeo(geo: string): string[] {
  if (!geo) return []
  const geoMap: Record<string, string> = {
    'NL': 'NL', 'BE': 'BE', 'DE': 'DE', 'FR': 'FR', 'UK': 'GB', 'GB': 'GB',
    'Netherlands': 'NL', 'Belgium': 'BE', 'Germany': 'DE', 'France': 'FR',
    'United Kingdom': 'GB', 'USA': 'US', 'US': 'US',
    'NL/BE': 'NL,BE', 'DACH': 'DE,AT,CH',
  }
  const mapped = geoMap[geo.trim()]
  if (mapped) return mapped.split(',')
  // Try to extract country codes from free text
  const codes = geo.match(/\b[A-Z]{2}\b/g) ?? []
  return codes.length > 0 ? codes : [geo.substring(0, 2).toUpperCase()]
}

async function searchCompanies(
  industries: string[],
  employeeRange: { min?: number; max?: number },
  countries: string[],
  perPage = 25
): Promise<ALeadsCompany[]> {
  const body: Record<string, unknown> = { per_page: perPage }
  if (industries.length > 0) body.industries = industries
  if (employeeRange.min !== undefined) body.employee_count_min = employeeRange.min
  if (employeeRange.max !== undefined) body.employee_count_max = employeeRange.max
  if (countries.length > 0) body.countries = countries

  const res = await fetch(`${ALEADS_BASE_URL}/companies/search`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ALEADS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`A-Leads companies/search error ${res.status}: ${err}`)
  }

  const data = await res.json() as { companies?: ALeadsCompany[]; results?: ALeadsCompany[] }
  return data.companies ?? data.results ?? []
}

async function searchContacts(
  domain: string,
  companyName: string,
  perPage = 3
): Promise<ALeadsContact[]> {
  const res = await fetch(`${ALEADS_BASE_URL}/contacts/search`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ALEADS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ domain, company_name: companyName, per_page: perPage }),
  })

  if (!res.ok) return []

  const data = await res.json() as { contacts?: ALeadsContact[] }
  return data.contacts ?? []
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

    if (!ALEADS_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'ALEADS_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: client, error: fetchError } = await supabase
      .from('clients')
      .select('id, name, strategy_synthesis, workflow_metrics')
      .eq('id', client_id)
      .single()

    if (fetchError || !client) {
      return new Response(
        JSON.stringify({ success: false, error: `Client not found: ${fetchError?.message}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!client.strategy_synthesis) {
      return new Response(
        JSON.stringify({ success: false, error: 'strategy_synthesis not available' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const synthesis = client.strategy_synthesis as Record<string, unknown>
    const icpSegments = (synthesis.icp_segments as Array<Record<string, unknown>>) ?? []
    const combos = (synthesis.icp_persona_combinations as Array<Record<string, unknown>>) ?? []
    const wm = (client.workflow_metrics as Record<string, unknown>) ?? {}
    const now = new Date().toISOString()

    // Focus on high-priority segments only
    const prioritySegments = combos
      .filter(c => c.priority === 'high')
      .map(c => c.icp as string)
      .filter(Boolean)

    const targetSegments = icpSegments.filter(
      seg => prioritySegments.length === 0 || prioritySegments.includes(seg.name as string)
    )

    if (targetSegments.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No ICP segments found in strategy_synthesis' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate a sourcing run ID for this batch
    const sourcing_run_id = `run_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
    console.log(`[${requestId}] Starting sourcing run ${sourcing_run_id} for client ${client_id}`)

    let totalCompanies = 0
    let totalContacts = 0
    const segmentStats: Array<{ name: string; companies: number; contacts: number }> = []

    for (const segment of targetSegments) {
      const segName = segment.name as string
      const geo = segment.geo as string ?? ''
      const empRange = segment.employee_range as string ?? ''
      const industries = (segment.industries as string[]) ?? []

      console.log(`[${requestId}] Sourcing segment: ${segName}`)

      let segCompanies = 0
      let segContacts = 0
      let companies: ALeadsCompany[] = []

      try {
        companies = await searchCompanies(
          industries,
          parseEmployeeRange(empRange),
          parseGeo(geo),
          25
        )
        console.log(`[${requestId}] Segment ${segName}: ${companies.length} companies`)
      } catch (err) {
        console.error(`[${requestId}] Company search failed for ${segName}:`, (err as Error).message)
        continue
      }

      // Insert companies
      for (const company of companies) {
        const domain = company.domain ?? company.website?.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] ?? ''

        // Upsert company
        const { data: existingCompany } = await supabase
          .from('companies')
          .select('id')
          .eq('client_id', client_id)
          .eq('domain', domain)
          .maybeSingle()

        let companyId: string

        if (existingCompany) {
          companyId = existingCompany.id
        } else {
          const { data: newCompany, error: insertErr } = await supabase
            .from('companies')
            .insert({
              client_id,
              name: company.name,
              domain: domain || null,
              website: company.website || null,
              industry: company.industry || null,
              employee_count: company.employee_count || null,
              employee_range: company.employee_range || null,
              country: company.country || null,
              city: company.city || null,
              linkedin_url: company.linkedin_url || null,
              source: 'aleads',
              source_id: company.id || null,
              enrichment_data: {
                sourcing_run_id,
                icp_segment: segName,
              },
              first_seen_at: now,
            })
            .select('id')
            .single()

          if (insertErr || !newCompany) {
            console.error(`[${requestId}] Company insert failed:`, insertErr?.message)
            continue
          }

          companyId = newCompany.id
          segCompanies++
          totalCompanies++
        }

        // Search contacts at this company
        if (domain) {
          const contacts = await searchContacts(domain, company.name, 2)

          for (const contact of contacts) {
            const { error: contactErr } = await supabase
              .from('contacts')
              .upsert({
                client_id,
                company_id: companyId,
                first_name: contact.first_name || null,
                last_name: contact.last_name || null,
                full_name: contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || null,
                email: contact.email || null,
                title: contact.title || null,
                linkedin_url: contact.linkedin_url || null,
                source: 'aleads',
                source_id: contact.id || null,
                enrichment_data: {
                  sourcing_run_id,
                  icp_segment: segName,
                  company_domain: domain,
                },
              }, {
                onConflict: 'client_id,email',
                ignoreDuplicates: true,
              })

            if (!contactErr) {
              segContacts++
              totalContacts++
            }
          }
        }
      }

      segmentStats.push({ name: segName, companies: segCompanies, contacts: segContacts })
    }

    // Update workflow_metrics + stage
    const updatedWm = {
      ...wm,
      sourcing_review: {
        ...((wm.sourcing_review as Record<string, unknown>) ?? {}),
        status: 'pending',
        started_at: now,
        attempts: 1,
        decided_at: null,
        duration_seconds: null,
        last_feedback: null,
        segments: segmentStats,
        total_companies: totalCompanies,
        total_contacts: totalContacts,
      },
    }

    const { error: updateError } = await supabase
      .from('clients')
      .update({
        stage: 'data_sourcing',
        workflow_metrics: updatedWm,
      })
      .eq('id', client_id)

    if (updateError) {
      console.error(`[${requestId}] DB update failed:`, updateError.message)
    }

    // Notify Slack
    const slackBotToken = Deno.env.get('SLACK_BOT_TOKEN')
    const slackChannel = Deno.env.get('SLACK_TEST_CHANNEL')

    if (slackBotToken && slackChannel) {
      fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${slackBotToken}` },
        body: JSON.stringify({
          channel: slackChannel,
          text: `Sourcing complete for ${client.name} — review required`,
          blocks: [{
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Sourcing Ready for Review*\n\nClient: *${client.name}*\nRun ID: \`${sourcing_run_id}\`\n\n*Per segment:*\n${segmentStats.map(s => `• ${s.name}: ${s.companies} companies, ${s.contacts} contacts`).join('\n')}\n\nTotaal: ${totalCompanies} companies, ${totalContacts} contacts\n\nApprove via:\n\`\`\`POST /functions/v1/gtm-approve\n{ "client_id": "${client_id}", "action": "sourcing_approve" }\`\`\``,
            },
          }],
        }),
      }).catch(err => console.error(`[${requestId}] Slack notify failed:`, err.message))
    }

    console.log(`[${requestId}] Sourcing complete: ${totalCompanies} companies, ${totalContacts} contacts (run: ${sourcing_run_id})`)

    return new Response(
      JSON.stringify({
        success: true,
        client_id,
        sourcing_run_id,
        companies_sourced: totalCompanies,
        contacts_found: totalContacts,
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
