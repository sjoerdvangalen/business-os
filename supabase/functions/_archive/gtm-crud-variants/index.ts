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
      const campaignRunId = url.searchParams.get('campaign_run_id')
      const variantType = url.searchParams.get('variant_type')
      const isWinner = url.searchParams.get('is_winner')

      let query = supabase.from('campaign_variants').select('*').order('created_at', { ascending: true })
      if (campaignRunId) query = query.eq('campaign_run_id', campaignRunId)
      if (variantType) query = query.eq('variant_type', variantType)
      if (isWinner !== null) query = query.eq('is_winner', isWinner === 'true')

      const { data, error } = await query
      if (error) throw error

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'GET' && id) {
      const { data, error } = await supabase
        .from('campaign_variants')
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

      if (!body.campaign_run_id) {
        return new Response(JSON.stringify({ error: 'Missing required field: campaign_run_id' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (!body.variant_label) {
        return new Response(JSON.stringify({ error: 'Missing required field: variant_label' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (!body.variant_type) {
        return new Response(JSON.stringify({ error: 'Missing required field: variant_type' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data, error } = await supabase
        .from('campaign_variants')
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

      // If marking this variant as winner, clear is_winner on siblings first
      if (body.is_winner === true) {
        const { data: current } = await supabase
          .from('campaign_variants')
          .select('campaign_run_id')
          .eq('id', id)
          .single()

        if (current) {
          await supabase
            .from('campaign_variants')
            .update({ is_winner: false })
            .eq('campaign_run_id', (current as { campaign_run_id: string }).campaign_run_id)
            .neq('id', id)
        }
      }

      const { data, error } = await supabase
        .from('campaign_variants')
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
        .from('campaign_variants')
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
    console.error('gtm-crud-variants error:', (error as Error).message)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
