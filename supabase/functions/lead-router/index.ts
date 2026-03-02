import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Lead Router — routes classified replies to the correct destination
 *
 * Routing rules:
 * - MEETING_REQUEST → opportunity in Supabase + Slack alert + PlusVibe label
 * - POSITIVE / INFO_REQUEST → PlusVibe label "Interested" + Slack alert
 * - NOT_INTERESTED → PlusVibe: mark COMPLETED (stops further emails)
 * - BLOCKLIST → PlusVibe: add to blocklist + delete from campaigns
 * - FUTURE_REQUEST → PlusVibe: update follow_up_date variable
 *
 * Called by reply-classifier after classification.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const {
      contact_id,
      contact_email,
      campaign_id,
      campaign_name,
      client_id,
      plusvibe_camp_id,
      category,
      confidence,
      reply_preview,
      follow_up_date,
    } = await req.json()

    const apiKey = Deno.env.get('PLUSVIBE_API_KEY')!
    const workspaceId = Deno.env.get('PLUSVIBE_WORKSPACE_ID')!
    const pvHeaders = { 'x-api-key': apiKey, 'Content-Type': 'application/json' }
    const actions: string[] = []

    switch (category) {
      case 'MEETING_REQUEST': {
        // 1. Update PlusVibe lead label
        await pvFetch('PATCH', '/lead/update-variable', {
          workspace_id: workspaceId,
          email: contact_email,
          campaign_id: plusvibe_camp_id,
          variables: { label: 'Meeting Booked' },
        }, pvHeaders)
        actions.push('PlusVibe: label → Meeting Booked')

        // 2. Create opportunity in Supabase
        await supabase.from('opportunities').insert({
          client_id,
          contact_id,
          campaign_id,
          stage: 'meeting_booked',
          source: 'cold_email',
          notes: `Auto-created from reply classification.\nReply: ${reply_preview}`,
        })
        actions.push('Supabase: opportunity created')

        // 3. Slack alert
        await sendSlackAlert(supabase, {
          channel: 'vgg-alerts',
          text: `🎯 *Meeting Request!*\n*Lead:* ${contact_email}\n*Campaign:* ${campaign_name}\n*Reply:* ${reply_preview}\n\n_Opportunity created. Respond ASAP._`,
        })
        actions.push('Slack: alert sent')
        break
      }

      case 'POSITIVE':
      case 'INFO_REQUEST': {
        // 1. Update PlusVibe lead label
        await pvFetch('PATCH', '/lead/update-variable', {
          workspace_id: workspaceId,
          email: contact_email,
          campaign_id: plusvibe_camp_id,
          variables: { label: 'Interested' },
        }, pvHeaders)
        actions.push(`PlusVibe: label → Interested (was ${category})`)

        // 2. Slack alert
        await sendSlackAlert(supabase, {
          channel: 'vgg-alerts',
          text: `✅ *${category === 'POSITIVE' ? 'Positive Reply' : 'Info Request'}*\n*Lead:* ${contact_email}\n*Campaign:* ${campaign_name}\n*Reply:* ${reply_preview}\n\n_Follow up manually._`,
        })
        actions.push('Slack: alert sent')
        break
      }

      case 'NOT_INTERESTED': {
        // 1. Mark lead as COMPLETED in PlusVibe (stops further emails)
        if (plusvibe_camp_id) {
          await pvFetch('PATCH', '/lead/update-status', {
            workspace_id: workspaceId,
            campaign_id: plusvibe_camp_id,
            email: contact_email,
            new_status: 'COMPLETED',
          }, pvHeaders)
          actions.push('PlusVibe: status → COMPLETED')
        }

        // 2. Update label
        await pvFetch('PATCH', '/lead/update-variable', {
          workspace_id: workspaceId,
          email: contact_email,
          campaign_id: plusvibe_camp_id,
          variables: { label: 'Not Interested' },
        }, pvHeaders)
        actions.push('PlusVibe: label → Not Interested')
        break
      }

      case 'BLOCKLIST': {
        // 1. Add to blocklist
        await pvFetch('POST', '/blocklist/add', {
          workspace_id: workspaceId,
          entries: [contact_email],
        }, pvHeaders)
        actions.push('PlusVibe: added to blocklist')

        // 2. Delete from campaigns (optional — blocklist already prevents future sends)
        // Not deleting to preserve history

        // 3. Slack alert
        await sendSlackAlert(supabase, {
          channel: 'vgg-alerts',
          text: `🚫 *Blocklist Request*\n*Lead:* ${contact_email}\n*Campaign:* ${campaign_name}\n*Reply:* ${reply_preview}\n\n_Added to blocklist automatically._`,
        })
        actions.push('Slack: alert sent')
        break
      }

      case 'FUTURE_REQUEST': {
        // 1. Update PlusVibe lead variables with follow-up date
        await pvFetch('PATCH', '/lead/update-variable', {
          workspace_id: workspaceId,
          email: contact_email,
          campaign_id: plusvibe_camp_id,
          variables: {
            label: 'Future Request',
            follow_up_date: follow_up_date,
          },
        }, pvHeaders)
        actions.push(`PlusVibe: label → Future Request, follow_up: ${follow_up_date}`)

        // 2. Mark as COMPLETED to stop current sequence
        if (plusvibe_camp_id) {
          await pvFetch('PATCH', '/lead/update-status', {
            workspace_id: workspaceId,
            campaign_id: plusvibe_camp_id,
            email: contact_email,
            new_status: 'COMPLETED',
          }, pvHeaders)
          actions.push('PlusVibe: status → COMPLETED (will re-engage later)')
        }
        break
      }
    }

    // Log routing actions to agent_memory
    await supabase.from('agent_memory').insert({
      agent_id: 'lead-router',
      memory_type: 'routing_log',
      content: `Routed ${contact_email} (${category}) → ${actions.join(', ')}`,
      metadata: {
        contact_id,
        contact_email,
        campaign_name,
        client_id,
        category,
        confidence,
        actions,
      },
    })

    console.log(`Routed ${contact_email} (${category}): ${actions.join(', ')}`)

    return new Response(
      JSON.stringify({ success: true, category, actions }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Router error:', (error as Error).message)
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

// Helper: PlusVibe API call
async function pvFetch(method: string, path: string, body: unknown, headers: Record<string, string>) {
  try {
    const url = `https://api.plusvibe.ai/api/v1${path}`
    const response = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      console.error(`PlusVibe ${method} ${path} failed: ${response.status}`)
    }
    return response
  } catch (e) {
    console.error(`PlusVibe ${method} ${path} error:`, (e as Error).message)
  }
}

// Helper: Send Slack alert via webhook
async function sendSlackAlert(supabase: ReturnType<typeof createClient>, { channel, text }: { channel: string; text: string }) {
  const slackWebhookUrl = Deno.env.get('SLACK_WEBHOOK_URL')
  if (!slackWebhookUrl) {
    console.log(`Slack alert (no webhook configured): [${channel}] ${text}`)
    // Store in agent_memory as fallback
    await supabase.from('agent_memory').insert({
      agent_id: 'lead-router',
      memory_type: 'slack_pending',
      content: text,
      metadata: { channel },
    })
    return
  }

  try {
    await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: `#${channel}`, text }),
    })
  } catch (e) {
    console.error('Slack error:', (e as Error).message)
  }
}
