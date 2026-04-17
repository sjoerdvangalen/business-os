import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
      const campaignCellId = url.searchParams.get('campaign_cell_id')
      const testPhase = url.searchParams.get('test_phase')
      const status = url.searchParams.get('status')

      let query = supabase.from('campaign_runs').select('*').order('created_at', { ascending: false })
      if (campaignCellId) query = query.eq('campaign_cell_id', campaignCellId)
      if (testPhase) query = query.eq('test_phase', testPhase)
      if (status) query = query.eq('status', status)

      const { data, error } = await query
      if (error) throw error

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'GET' && id) {
      const { data, error } = await supabase
        .from('campaign_runs')
        .select('*')
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

      if (!body.campaign_cell_id) {
        return new Response(JSON.stringify({ error: 'Missing required field: campaign_cell_id' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (!body.test_phase) {
        return new Response(JSON.stringify({ error: 'Missing required field: test_phase' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Auto-generate run_code and run_slug if not provided
      if (!body.run_code || !body.run_slug) {
        const { data: cell } = await supabase
          .from('campaign_cells')
          .select('cell_code, cell_slug')
          .eq('id', body.campaign_cell_id as string)
          .single()

        if (!cell) {
          return new Response(JSON.stringify({ error: 'campaign_cell_id not found' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        // Count existing runs for this cell + phase to derive version number
        const { count } = await supabase
          .from('campaign_runs')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_cell_id', body.campaign_cell_id as string)
          .eq('test_phase', body.test_phase as string)

        const version = (body.version as number) ?? ((count ?? 0) + 1)
        const testPhase = body.test_phase as string

        body.version = version
        body.run_code = `${(cell as { cell_code: string }).cell_code} | ${testPhase} | V${version}`
        body.run_slug = `${(cell as { cell_slug: string }).cell_slug}-${testPhase.toLowerCase()}-v${version}`
      }

      const { data, error } = await supabase
        .from('campaign_runs')
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
        .from('campaign_runs')
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
        .from('campaign_runs')
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
    console.error('gtm-crud-runs error:', (error as Error).message)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
