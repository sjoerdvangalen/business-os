import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { checkLiveTestReadiness } from "../_shared/checkLiveTestReadiness.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_STATUSES = ['provisioning', 'warmup', 'ready', 'blocked'] as const
type InfraStatus = typeof VALID_STATUSES[number]

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
    const { client_id, status, feedback } = await req.json() as {
      client_id: string
      status: InfraStatus
      feedback?: string
    }

    if (!client_id || !status) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing client_id or status' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!VALID_STATUSES.includes(status)) {
      return new Response(
        JSON.stringify({ success: false, error: `Invalid status: ${status}. Must be one of: ${VALID_STATUSES.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: client, error: fetchError } = await supabase
      .from('clients')
      .select('id, workflow_metrics')
      .eq('id', client_id)
      .single()

    if (fetchError || !client) {
      return new Response(
        JSON.stringify({ success: false, error: `Client not found: ${fetchError?.message}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const wm = (client.workflow_metrics as Record<string, unknown>) ?? {}
    const now = new Date().toISOString()

    const updatedWm = {
      ...wm,
      infra: {
        status,
        last_feedback: feedback ?? null,
        updated_at: now,
      },
    }

    const { error: updateError } = await supabase
      .from('clients')
      .update({ workflow_metrics: updatedWm })
      .eq('id', client_id)

    if (updateError) {
      console.error(`[${requestId}] DB update failed:`, updateError.message)
      return new Response(
        JSON.stringify({ success: false, error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[${requestId}] Infra status updated: client=${client_id} status=${status}`)

    // Check if all conditions are now met for campaign push
    if (status === 'ready') {
      await checkLiveTestReadiness(supabase, client_id)
    }

    return new Response(
      JSON.stringify({ success: true, client_id, status, request_id: requestId }),
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
