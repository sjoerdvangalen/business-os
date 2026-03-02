import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Webhook Receiver — processes real-time events from PlusVibe
 *
 * Events handled:
 * - ALL_EMAIL_REPLIES: New reply received → classify + route
 * - BOUNCED_EMAIL: Email bounced → update contact + alert
 * - EMAIL_SENT: Email sent → update stats
 * - LEAD_MARKED_AS_*: Lead label changed → update contact
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
    const payload = await req.json()
    console.log('Webhook received:', JSON.stringify(payload).substring(0, 500))

    const eventType = payload.event || payload.event_type || ''
    const leadEmail = payload.lead_email || payload.email || payload.to_email || ''
    const campaignId = payload.camp_id || payload.campaign_id || ''
    const replyBody = payload.reply_body || payload.body || payload.email_body || ''
    const subject = payload.subject || ''
    const fromEmail = payload.from_email || payload.from || ''

    // Look up campaign in Supabase
    let campaign = null
    if (campaignId) {
      const { data } = await supabase
        .from('campaigns')
        .select('id, client_id, name')
        .eq('plusvibe_id', campaignId)
        .single()
      campaign = data
    }

    // Look up or create contact
    let contact = null
    if (leadEmail) {
      const { data } = await supabase
        .from('contacts')
        .select('id, email, reply_count, lead_status')
        .eq('email', leadEmail.toLowerCase())
        .limit(1)
        .single()
      contact = data
    }

    // Handle event types
    switch (true) {
      case eventType.includes('REPLY') || eventType === 'ALL_EMAIL_REPLIES': {
        // Store the email message
        await supabase.from('email_threads').insert({
          plusvibe_id: payload.email_id || payload.id || `wh-${Date.now()}`,
          contact_id: contact?.id,
          campaign_id: campaign?.id,
          direction: 'received',
          from_email: leadEmail,
          to_email: fromEmail,
          subject: subject,
          body_text: replyBody,
          content_preview: replyBody?.substring(0, 200),
          email_type: 'reply',
          webhook_event: eventType,
          webhook_received_at: new Date().toISOString(),
          is_unread: true,
        })

        // Update contact reply count
        if (contact) {
          await supabase.from('contacts').update({
            replied_count: (contact.reply_count || 0) + 1,
            last_reply_at: new Date().toISOString(),
          }).eq('id', contact.id)
        }

        // Call reply-classifier
        const classifierUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/reply-classifier`
        await fetch(classifierUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({
            contact_id: contact?.id,
            contact_email: leadEmail,
            campaign_id: campaign?.id,
            campaign_name: campaign?.name,
            client_id: campaign?.client_id,
            plusvibe_camp_id: campaignId,
            reply_body: replyBody,
            subject: subject,
          }),
        })

        console.log(`Reply processed for ${leadEmail} in campaign ${campaign?.name}`)
        break
      }

      case eventType === 'BOUNCED_EMAIL': {
        // Store bounce event
        await supabase.from('email_threads').insert({
          plusvibe_id: payload.email_id || `bounce-${Date.now()}`,
          contact_id: contact?.id,
          campaign_id: campaign?.id,
          direction: 'sent',
          from_email: fromEmail,
          to_email: leadEmail,
          subject: subject,
          email_type: 'bounce',
          webhook_event: 'BOUNCED_EMAIL',
          webhook_received_at: new Date().toISOString(),
          body_text: payload.bounce_message || 'Bounced',
        })

        // Update contact
        if (contact) {
          await supabase.from('contacts').update({
            bounced: true,
            bounce_message: payload.bounce_message || 'Bounced via webhook',
            lead_status: 'bounced',
          }).eq('id', contact.id)
        }

        // Log alert
        await supabase.from('agent_memory').insert({
          agent_id: 'webhook-receiver',
          memory_type: 'bounce_alert',
          content: `Bounce: ${leadEmail} in ${campaign?.name || campaignId}`,
          metadata: { email: leadEmail, campaign: campaign?.name, bounce_message: payload.bounce_message },
        })

        console.log(`Bounce processed for ${leadEmail}`)
        break
      }

      case eventType === 'EMAIL_SENT': {
        // Store sent event
        await supabase.from('email_threads').insert({
          plusvibe_id: payload.email_id || `sent-${Date.now()}`,
          contact_id: contact?.id,
          campaign_id: campaign?.id,
          direction: 'sent',
          from_email: fromEmail,
          to_email: leadEmail,
          subject: subject,
          body_text: payload.body || '',
          email_type: 'campaign',
          webhook_event: 'EMAIL_SENT',
          webhook_received_at: new Date().toISOString(),
          sent_at: new Date().toISOString(),
        })

        // Update contact status
        if (contact && contact.lead_status === 'new') {
          await supabase.from('contacts').update({
            lead_status: 'contacted',
          }).eq('id', contact.id)
        }

        console.log(`Sent event processed for ${leadEmail}`)
        break
      }

      case eventType.includes('LEAD_MARKED_AS'): {
        // Extract label from event type (e.g., LEAD_MARKED_AS_INTERESTED → INTERESTED)
        const label = eventType.replace('LEAD_MARKED_AS_', '')

        if (contact) {
          await supabase.from('contacts').update({
            label: label,
            lead_status: label.toLowerCase().includes('interested') ? 'interested'
              : label.toLowerCase().includes('meeting') ? 'meeting_booked'
              : contact.lead_status,
          }).eq('id', contact.id)
        }

        console.log(`Label update: ${leadEmail} → ${label}`)
        break
      }

      default:
        console.log(`Unhandled event type: ${eventType}`)
    }

    return new Response(
      JSON.stringify({ success: true, event: eventType, lead: leadEmail }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Webhook error:', (error as Error).message)

    // Log error
    await supabase.from('agent_memory').insert({
      agent_id: 'webhook-receiver',
      memory_type: 'webhook_error',
      content: `Webhook processing error: ${(error as Error).message}`,
    }).catch(() => {})

    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
