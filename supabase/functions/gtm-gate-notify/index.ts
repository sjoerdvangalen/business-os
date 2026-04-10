import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN') ?? ''
const SLACK_TEST_CHANNEL = Deno.env.get('SLACK_TEST_CHANNEL') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function postSlackMessage(channel: string, text: string, blocks?: unknown[]): Promise<void> {
  const body: Record<string, unknown> = { channel, text }
  if (blocks) body.blocks = blocks

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Slack API error ${res.status}: ${err}`)
  }

  const data = await res.json() as { ok: boolean; error?: string }
  if (!data.ok) {
    throw new Error(`Slack error: ${data.error}`)
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
    const { client_id, event } = await req.json() as {
      client_id: string
      event?: string
    }

    if (!client_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing client_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!SLACK_BOT_TOKEN || !SLACK_TEST_CHANNEL) {
      console.warn(`[${requestId}] Slack not configured — skipping notification`)
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'Slack not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: client, error: fetchError } = await supabase
      .from('clients')
      .select('id, name, strategy_synthesis, workflow_metrics, gtm_strategy_doc_url, gtm_strategy_doc_external_url')
      .eq('id', client_id)
      .single()

    if (fetchError || !client) {
      return new Response(
        JSON.stringify({ success: false, error: `Client not found: ${fetchError?.message}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const synthesis = (client.strategy_synthesis as Record<string, unknown>) ?? {}
    const solutions = (synthesis.solutions as Array<{ name: string }>) ?? []
    const solutionNames = solutions.map(s => s.name).filter(Boolean).join(', ') || 'Not specified'
    const docUrl = (client.gtm_strategy_doc_url as string) || null
    const externalDocUrl = (client.gtm_strategy_doc_external_url as string) || null
    const wm = (client.workflow_metrics as Record<string, unknown>) ?? {}
    const sourcingReview = (wm.sourcing_review as Record<string, unknown>) ?? {}
    const sourcingSegments = (sourcingReview.segments as Array<{ name: string; companies: number; contacts: number }>) ?? []

    const notifyEvent = event || 'internal_review'

    let message = ''
    let blocks: unknown[] = []

    if (notifyEvent === 'internal_review') {
      message = `GTM Strategy ready for internal review: ${client.name}`
      blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*GTM Strategy — Internal Review*\n\nClient: *${client.name}*\nSolutions: ${solutionNames}`,
          },
        },
        ...(docUrl ? [{
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Internal Doc:* <${docUrl}|View Strategy Document>`,
          },
        }] : [{
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '_Internal doc not yet generated_',
          },
        }]),
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Approve or reject via:\n\`\`\`POST /functions/v1/gtm-approve\n{ "client_id": "${client_id}", "action": "internal_approve", "score": 85, "feedback": "..." }\`\`\``,
          },
        },
      ]
    } else if (notifyEvent === 'external_review') {
      message = `GTM Strategy ready for external review: ${client.name}`
      blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*GTM Strategie — Externe Review*\n\nClient: *${client.name}*\nOplossingen: ${solutionNames}`,
          },
        },
        ...(externalDocUrl ? [{
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Externe Doc:* <${externalDocUrl}|Bekijk Strategie Document>`,
          },
        }] : [{
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '_Externe doc nog niet aangemaakt_',
          },
        }]),
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Approve of reject na client feedback:\n\`\`\`POST /functions/v1/gtm-approve\n{ "client_id": "${client_id}", "action": "external_approve", "feedback": "..." }\`\`\``,
          },
        },
      ]
    } else if (notifyEvent === 'sourcing_complete') {
      const totalCompanies = (sourcingReview.total_companies as number) ?? 0
      const totalContacts = (sourcingReview.total_contacts as number) ?? 0
      const segmentLines = sourcingSegments.length > 0
        ? sourcingSegments.map(s => `• ${s.name}: ${s.companies} companies, ${s.contacts} contacts`).join('\n')
        : '_Geen segment data beschikbaar_'

      message = `Sourcing complete for ${client.name} — review required`
      blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Sourcing Klaar voor Review*\n\nClient: *${client.name}*\n\n*Per segment:*\n${segmentLines}\n\nTotaal: ${totalCompanies} companies, ${totalContacts} contacts`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Approve als volume voldoende is:\n\`\`\`POST /functions/v1/gtm-approve\n{ "client_id": "${client_id}", "action": "sourcing_approve" }\`\`\``,
          },
        },
      ]
    } else if (notifyEvent === 'ready_for_campaign') {
      message = `Client ${client.name} is ready for campaign launch`
      blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Campaign Ready*\n\nClient: *${client.name}*\n\nAll conditions met:\n• Internal approval ✓\n• External approval ✓\n• Messaging approval ✓\n• Sourcing review ✓\n• Infra ready ✓\n\nTrigger campaign push:\n\`\`\`POST /functions/v1/gtm-campaign-push\n{ "client_id": "${client_id}" }\`\`\``,
          },
        },
      ]
    }

    await postSlackMessage(SLACK_TEST_CHANNEL, message, blocks)

    console.log(`[${requestId}] Slack notification sent: event=${notifyEvent} client=${client_id}`)

    return new Response(
      JSON.stringify({ success: true, client_id, event: notifyEvent, request_id: requestId }),
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
