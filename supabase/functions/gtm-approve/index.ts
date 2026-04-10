import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { checkLiveTestReadiness } from "../_shared/checkLiveTestReadiness.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type WorkflowBlock = {
  status: string
  attempts: number
  started_at: string | null
  decided_at: string | null
  duration_seconds: number | null
  last_feedback: string | null
}

type WorkflowMetrics = {
  intake: WorkflowBlock
  internal_approval: WorkflowBlock
  external_approval: WorkflowBlock
  messaging_approval: WorkflowBlock
  sourcing_review: WorkflowBlock
  infra: { status: string; last_feedback: string | null; updated_at: string | null }
  totals: { pipeline_started_at: string | null; days_to_first_live_test: number | null }
}

function durationSeconds(startedAt: string | null, decidedAt: string): number | null {
  if (!startedAt) return null
  return Math.round((new Date(decidedAt).getTime() - new Date(startedAt).getTime()) / 1000)
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
    const { client_id, action, score, feedback } = await req.json() as {
      client_id: string
      action: string
      score?: number
      feedback?: string
    }

    if (!client_id || !action) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing client_id or action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const validActions = [
      'internal_approve', 'internal_reject',
      'external_approve', 'external_reject',
      'messaging_approve', 'messaging_reject',
      'sourcing_approve', 'sourcing_reject',
    ]

    if (!validActions.includes(action)) {
      return new Response(
        JSON.stringify({ success: false, error: `Invalid action: ${action}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: client, error: fetchError } = await supabase
      .from('clients')
      .select('id, name, approval_status, workflow_metrics')
      .eq('id', client_id)
      .single()

    if (fetchError || !client) {
      return new Response(
        JSON.stringify({ success: false, error: `Client not found: ${fetchError?.message}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const wm = (client.workflow_metrics as WorkflowMetrics) ?? {}
    const now = new Date().toISOString()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    let updatePayload: Record<string, unknown> = {}

    // ── internal_approve ───────────────────────────────────────────────────
    if (action === 'internal_approve') {
      const block = wm.internal_approval ?? {}
      const updatedWm = {
        ...wm,
        internal_approval: {
          ...block,
          status: 'approved',
          decided_at: now,
          duration_seconds: durationSeconds(block.started_at ?? null, now),
          last_feedback: feedback ?? block.last_feedback ?? null,
          ...(score !== undefined ? { score } : {}),
        },
      }
      updatePayload = {
        approval_status: 'internal_approved',
        workflow_metrics: updatedWm,
      }

      // Trigger external doc render (fire-and-forget)
      EdgeRuntime.waitUntil(
        fetch(`${supabaseUrl}/functions/v1/gtm-doc-render`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({ client_id, mode: 'external' }),
        }).then(r => console.log(`[${requestId}] gtm-doc-render triggered: ${r.status}`))
          .catch(err => console.error(`[${requestId}] gtm-doc-render trigger failed:`, err.message))
      )
    }

    // ── internal_reject ────────────────────────────────────────────────────
    else if (action === 'internal_reject') {
      const block = wm.internal_approval ?? {}
      const updatedWm = {
        ...wm,
        internal_approval: {
          ...block,
          status: 'rejected',
          decided_at: now,
          duration_seconds: durationSeconds(block.started_at ?? null, now),
          last_feedback: feedback ?? block.last_feedback ?? null,
        },
      }
      updatePayload = {
        approval_status: 'internal_rejected',
        workflow_metrics: updatedWm,
      }
    }

    // ── external_approve ───────────────────────────────────────────────────
    else if (action === 'external_approve') {
      const block = wm.external_approval ?? {}
      const updatedWm = {
        ...wm,
        external_approval: {
          ...block,
          status: 'approved',
          decided_at: now,
          duration_seconds: durationSeconds(block.started_at ?? null, now),
          last_feedback: feedback ?? block.last_feedback ?? null,
        },
      }
      updatePayload = {
        approval_status: 'external_approved',
        workflow_metrics: updatedWm,
      }

      // Trigger sourcing first — messaging comes after sourcing_approve
      EdgeRuntime.waitUntil(
        fetch(`${supabaseUrl}/functions/v1/gtm-aleads-source`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({ client_id }),
        }).then(r => console.log(`[${requestId}] gtm-aleads-source triggered: ${r.status}`))
          .catch(err => console.error(`[${requestId}] gtm-aleads-source trigger failed:`, err.message))
      )
    }

    // ── external_reject ────────────────────────────────────────────────────
    else if (action === 'external_reject') {
      const block = wm.external_approval ?? {}
      const updatedWm = {
        ...wm,
        external_approval: {
          ...block,
          status: 'iteration',
          attempts: (block.attempts ?? 0) + 1,
          decided_at: now,
          duration_seconds: durationSeconds(block.started_at ?? null, now),
          last_feedback: feedback ?? block.last_feedback ?? null,
        },
      }
      updatePayload = {
        approval_status: 'external_iteration',
        workflow_metrics: updatedWm,
      }
    }

    // ── messaging_approve ──────────────────────────────────────────────────
    else if (action === 'messaging_approve') {
      const block = wm.messaging_approval ?? {}
      const updatedWm = {
        ...wm,
        messaging_approval: {
          ...block,
          status: 'approved',
          decided_at: now,
          duration_seconds: durationSeconds(block.started_at ?? null, now),
          last_feedback: feedback ?? block.last_feedback ?? null,
        },
      }
      updatePayload = { workflow_metrics: updatedWm }

      const { error: updateError } = await supabase
        .from('clients')
        .update(updatePayload)
        .eq('id', client_id)

      if (updateError) throw new Error(updateError.message)

      // Messaging approved → check if all conditions met for campaign push
      await checkLiveTestReadiness(supabase, client_id)

      console.log(`[${requestId}] Action ${action} for client ${client_id}`)
      return new Response(
        JSON.stringify({ success: true, client_id, action, request_id: requestId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── messaging_reject ───────────────────────────────────────────────────
    else if (action === 'messaging_reject') {
      const block = wm.messaging_approval ?? {}
      const updatedWm = {
        ...wm,
        messaging_approval: {
          ...block,
          status: 'rejected',
          attempts: (block.attempts ?? 0) + 1,
          decided_at: now,
          duration_seconds: durationSeconds(block.started_at ?? null, now),
          last_feedback: feedback ?? block.last_feedback ?? null,
        },
      }
      updatePayload = { workflow_metrics: updatedWm }
    }

    // ── sourcing_approve ───────────────────────────────────────────────────
    else if (action === 'sourcing_approve') {
      const block = wm.sourcing_review ?? {}
      const updatedWm = {
        ...wm,
        sourcing_review: {
          ...block,
          status: 'approved',
          decided_at: now,
          duration_seconds: durationSeconds(block.started_at ?? null, now),
          last_feedback: feedback ?? block.last_feedback ?? null,
        },
      }
      updatePayload = { workflow_metrics: updatedWm }

      const { error: updateError } = await supabase
        .from('clients')
        .update(updatePayload)
        .eq('id', client_id)

      if (updateError) throw new Error(updateError.message)

      // Sourcing approved → trigger messaging doc next
      EdgeRuntime.waitUntil(
        fetch(`${supabaseUrl}/functions/v1/gtm-messaging-doc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({ client_id }),
        }).then(r => console.log(`[${requestId}] gtm-messaging-doc triggered: ${r.status}`))
          .catch(err => console.error(`[${requestId}] gtm-messaging-doc trigger failed:`, err.message))
      )

      console.log(`[${requestId}] Action ${action} for client ${client_id}`)
      return new Response(
        JSON.stringify({ success: true, client_id, action, request_id: requestId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── sourcing_reject ────────────────────────────────────────────────────
    else if (action === 'sourcing_reject') {
      const block = wm.sourcing_review ?? {}
      const updatedWm = {
        ...wm,
        sourcing_review: {
          ...block,
          status: 'rejected',
          attempts: (block.attempts ?? 0) + 1,
          decided_at: now,
          duration_seconds: durationSeconds(block.started_at ?? null, now),
          last_feedback: feedback ?? block.last_feedback ?? null,
        },
      }
      updatePayload = { workflow_metrics: updatedWm }
    }

    console.log(`[${requestId}] Action ${action} for client ${client_id}`)

    const { error: updateError } = await supabase
      .from('clients')
      .update(updatePayload)
      .eq('id', client_id)

    if (updateError) {
      console.error(`[${requestId}] Update failed:`, updateError.message)
      return new Response(
        JSON.stringify({ success: false, error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, client_id, action, request_id: requestId }),
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
