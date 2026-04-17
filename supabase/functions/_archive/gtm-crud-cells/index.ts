import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function toSlugPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const url = new URL(req.url)
    const segments = url.pathname.split('/').filter(Boolean)
    const id = segments[1] ?? null

    if (req.method === 'GET' && !id) {
      const clientId = url.searchParams.get('client_id')
      const gtmStrategyId = url.searchParams.get('gtm_strategy_id')
      const status = url.searchParams.get('status')

      let query = supabase
        .from('campaign_cells')
        .select('*')
        .order('priority_score', { ascending: false })

      if (clientId) query = query.eq('client_id', clientId)
      if (gtmStrategyId) query = query.eq('gtm_strategy_id', gtmStrategyId)
      if (status) query = query.eq('status', status)

      const { data, error } = await query
      if (error) throw error

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'GET' && id) {
      const { data, error } = await supabase
        .from('campaign_cells')
        .select(`
          *,
          solutions(id, solution_name, commercial_label),
          icp_segments(id, segment_name),
          buyer_personas(id, persona_name, role_title),
          entry_offers(id, offer_name, offer_type, friction_score)
        `)
        .eq('id', id)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        throw error
      }

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'POST') {
      let body: Record<string, unknown>
      try {
        body = await req.json()
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const required = ['gtm_strategy_id', 'client_id', 'solution_id', 'segment_id', 'primary_persona_id', 'entry_offer_id']
      for (const field of required) {
        if (!body[field]) {
          return new Response(JSON.stringify({ error: `Missing required field: ${field}` }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      // Auto-generate cell_code and cell_slug if not provided
      if (!body.cell_code || !body.cell_slug) {
        const [clientRow, solutionRow, segmentRow, personaRow] = await Promise.all([
          supabase.from('clients').select('code').eq('id', body.client_id as string).single(),
          supabase.from('solutions').select('solution_name').eq('id', body.solution_id as string).single(),
          supabase.from('icp_segments').select('segment_name').eq('id', body.segment_id as string).single(),
          supabase.from('buyer_personas').select('persona_name').eq('id', body.primary_persona_id as string).single(),
        ])

        const clientCode = (clientRow.data as { code: string } | null)?.code ?? 'UNKNOWN'
        const language = (body.language as string) ?? 'EN'
        const solutionName = (solutionRow.data as { solution_name: string } | null)?.solution_name ?? 'Solution'
        const segmentName = (segmentRow.data as { segment_name: string } | null)?.segment_name ?? 'Segment'
        const personaName = (personaRow.data as { persona_name: string } | null)?.persona_name ?? 'Persona'
        const region = (body.region as string) ?? 'NL'

        const solutionShort = solutionName.split(' ').slice(0, 2).join(' ')
        const segmentShort = segmentName.split(' ').slice(0, 2).join(' ')
        const personaShort = personaName.split(' ').slice(0, 2).join(' ')

        body.cell_code = `${clientCode} | ${language} | ${solutionShort} ${segmentShort} ${personaShort} ${region}`
        body.cell_slug = `${toSlugPart(clientCode)}-${toSlugPart(language)}-${toSlugPart(solutionShort)}-${toSlugPart(segmentShort)}-${toSlugPart(personaShort)}-${toSlugPart(region)}`
      }

      const { data, error } = await supabase
        .from('campaign_cells')
        .insert(body)
        .select()
        .single()

      if (error) throw error

      return new Response(JSON.stringify({ data }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'PATCH' && id) {
      let body: Record<string, unknown>
      try {
        body = await req.json()
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data, error } = await supabase
        .from('campaign_cells')
        .update(body)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        throw error
      }

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'DELETE' && id) {
      const { error } = await supabase
        .from('campaign_cells')
        .delete()
        .eq('id', id)

      if (error) throw error

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('gtm-crud-cells error:', (error as Error).message)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
