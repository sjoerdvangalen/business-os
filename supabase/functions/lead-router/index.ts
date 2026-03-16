import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Lead Router — logs classified replies for human review
 *
 * NOTE: Does NOT push changes to PlusVibe automatically — all actions are
 * logged in Supabase for human review and approval before PlusVibe updates.
 *
 * Routing rules (human-in-the-loop):
 * - MEETING_REQUEST → opportunity in Supabase + Slack alert
 * - POSITIVE / INFO_REQUEST → Slack alert + agent_memory log
 * - NOT_INTERESTED → Slack alert + agent_memory log
 * - BLOCKLIST → Slack alert + agent_memory log
 * - FUTURE_REQUEST → follow_up_date calculated + agent_memory log
 *
 * All PlusVibe updates (label, status, blocklist) must be done manually
 * or via a separate approval workflow.
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

    const actions: string[] = []

    switch (category) {
      case 'MEETING_REQUEST': {
        // 1. Create opportunity in Supabase
        await supabase.from('opportunities').insert({
          client_id,
          lead_id: contact_id,
          campaign_id,
          stage: 'meeting_booked',
          source: 'cold_email',
          notes: `Auto-created from reply classification (needs manual PlusVibe update).\nReply: ${reply_preview}`,
        })
        actions.push('Supabase: opportunity created')

        // 2. Slack alert (HUMAN REVIEW NEEDED)
        await sendSlackAlert(supabase, {
          channel: 'sales-alerts',
          text: `🎯 *Meeting Request!*\n*Lead:* ${contact_email}\n*Campaign:* ${campaign_name}\n*Reply:* ${reply_preview}\n\n_Opportunity created in Supabase. MANUAL: Update PlusVibe label to "Meeting Booked"._`,
        })
        actions.push('Slack: alert sent (PlusVibe label update pending manual approval)')
        break
      }

      case 'POSITIVE':
      case 'INFO_REQUEST': {
        // 1. Log to Supabase for human review
        actions.push(`Supabase: logged for review (classification: ${category})`)

        // 2. Slack alert (HUMAN REVIEW NEEDED)
        await sendSlackAlert(supabase, {
          channel: 'sales-alerts',
          text: `✅ *${category === 'POSITIVE' ? 'Positive Reply' : 'Info Request'}*\n*Lead:* ${contact_email}\n*Campaign:* ${campaign_name}\n*Reply:* ${reply_preview}\n\n_Logged in Supabase. MANUAL: Update PlusVibe label if needed._`,
        })
        actions.push('Slack: alert sent (PlusVibe label update pending manual approval)')
        break
      }

      case 'NOT_INTERESTED': {
        // 1. Log to Supabase for human review
        actions.push('Supabase: logged for review')

        // 2. Slack alert (HUMAN REVIEW NEEDED)
        await sendSlackAlert(supabase, {
          channel: 'sales-alerts',
          text: `❌ *Not Interested*\n*Lead:* ${contact_email}\n*Campaign:* ${campaign_name}\n*Reply:* ${reply_preview}\n\n_Logged in Supabase. MANUAL: Mark as COMPLETED in PlusVibe to stop further emails._`,
        })
        actions.push('Slack: alert sent (PlusVibe status update pending manual approval)')
        break
      }

      case 'BLOCKLIST': {
        // 1. Log to Supabase for human review
        actions.push('Supabase: logged for review (blocklist request)')

        // 2. Slack alert (HUMAN REVIEW NEEDED)
        await sendSlackAlert(supabase, {
          channel: 'sales-alerts',
          text: `🚫 *Blocklist Request*\n*Lead:* ${contact_email}\n*Campaign:* ${campaign_name}\n*Reply:* ${reply_preview}\n\n_Logged in Supabase. MANUAL: Add to PlusVibe blocklist and delete from campaigns._`,
        })
        actions.push('Slack: alert sent (blocklist action pending manual approval)')
        break
      }

      case 'FUTURE_REQUEST': {
        // 1. Log follow-up date to Supabase for human review
        actions.push(`Supabase: logged for review (follow-up: ${follow_up_date})`)

        // 2. Slack alert (HUMAN REVIEW NEEDED)
        await sendSlackAlert(supabase, {
          channel: 'sales-alerts',
          text: `⏰ *Future Request*\n*Lead:* ${contact_email}\n*Campaign:* ${campaign_name}\n*Follow-up Date:* ${follow_up_date}\n*Reply:* ${reply_preview}\n\n_Logged in Supabase. MANUAL: Update PlusVibe label + follow-up date, then mark as COMPLETED to stop current sequence._`,
        })
        actions.push('Slack: alert sent (PlusVibe follow-up action pending manual approval)')
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
