import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const EXA_API_KEY = Deno.env.get('EXA_API_KEY') ?? ''

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

  const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

  try {
    // Fetch all clients with pending Exa research
    const { data: clients, error: fetchError } = await supabase
      .from('clients')
      .select('id, exa_research')
      .eq('exa_research->>status', 'pending')

    if (fetchError) {
      return new Response(
        JSON.stringify({ success: false, error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!clients || clients.length === 0) {
      return new Response(
        JSON.stringify({ success: true, polled: 0, message: 'No pending research tasks' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[${requestId}] Polling ${clients.length} pending Exa research task(s)`)

    const results = await Promise.allSettled(
      clients.map(client => pollClient(supabase, client, requestId))
    )

    const completed = results.filter(r => r.status === 'fulfilled' && (r.value as Record<string, unknown>).action === 'completed').length
    const failed = results.filter(r => r.status === 'fulfilled' && (r.value as Record<string, unknown>).action === 'failed').length
    const pending = results.filter(r => r.status === 'fulfilled' && (r.value as Record<string, unknown>).action === 'still_pending').length

    return new Response(
      JSON.stringify({ success: true, polled: clients.length, completed, failed, pending }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const msg = (error as Error).message
    console.error(`[${requestId}] Unhandled error:`, msg)
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function pollClient(
  supabase: ReturnType<typeof createClient>,
  client: { id: string; exa_research: Record<string, unknown> },
  requestId: string
): Promise<{ client_id: string; action: string }> {
  const taskId = client.exa_research?.task_id as string

  if (!taskId) {
    console.warn(`[${requestId}] Client ${client.id} has no task_id in exa_research`)
    return { client_id: client.id, action: 'no_task_id' }
  }

  try {
    const exaResponse = await fetch(`https://api.exa.ai/research/v1/${taskId}`, {
      headers: { 'x-api-key': EXA_API_KEY },
    })

    if (!exaResponse.ok) {
      const errText = await exaResponse.text()
      console.error(`[${requestId}] Exa poll error for task ${taskId}: ${exaResponse.status} ${errText}`)

      if (exaResponse.status === 404) {
        await supabase.from('clients').update({
          exa_research: { ...client.exa_research, status: 'failed', error: 'Task not found' },
        }).eq('id', client.id)
        return { client_id: client.id, action: 'failed' }
      }

      return { client_id: client.id, action: 'still_pending' }
    }

    const taskData = await exaResponse.json() as { status?: string; [key: string]: unknown }
    console.log(`[${requestId}] Task ${taskId} status: ${taskData.status}`)

    if (taskData.status === 'completed') {
      const now = new Date().toISOString()
      await supabase.from('clients').update({
        exa_research: {
          ...client.exa_research,
          status: 'completed',
          result: taskData,
          fetched_at: now,
          error: null,
        },
      }).eq('id', client.id)

      // Trigger synthesis (fire-and-forget)
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      fetch(`${supabaseUrl}/functions/v1/gtm-synthesis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ client_id: client.id }),
      }).catch(err => console.error(`[${requestId}] gtm-synthesis trigger failed for ${client.id}:`, err.message))

      console.log(`[${requestId}] Research completed for client ${client.id}, triggered gtm-synthesis`)
      return { client_id: client.id, action: 'completed' }
    }

    if (taskData.status === 'failed' || taskData.status === 'error') {
      await supabase.from('clients').update({
        exa_research: {
          ...client.exa_research,
          status: 'failed',
          error: (taskData.error as string) || taskData.status,
        },
      }).eq('id', client.id)
      return { client_id: client.id, action: 'failed' }
    }

    // Still in progress (running, queued, etc.)
    return { client_id: client.id, action: 'still_pending' }

  } catch (err) {
    console.error(`[${requestId}] Poll failed for client ${client.id}:`, (err as Error).message)
    return { client_id: client.id, action: 'still_pending' }
  }
}
