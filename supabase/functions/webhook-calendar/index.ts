import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Webhook Calendar — processes Cal.com booking events
 *
 * Events handled:
 * - BOOKING_CREATED: New meeting booked → insert meeting + match contact + Slack alert
 * - BOOKING_CANCELLED: Meeting cancelled → update status + Slack alert
 * - BOOKING_RESCHEDULED: Meeting rescheduled → update time + Slack alert
 *
 * Cal.com webhook URL: https://<project-ref>.supabase.co/functions/v1/webhook-calendar
 * Configure in Cal.com → Settings → Developer → Webhooks
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
    console.log('Cal.com webhook:', JSON.stringify(payload).substring(0, 500))

    // Cal.com webhook payload structure
    const triggerEvent = payload.triggerEvent || ''
    const bookingPayload = payload.payload || {}

    const bookingId = bookingPayload.uid || bookingPayload.bookingId || ''
    const eventType = bookingPayload.type || bookingPayload.eventType?.title || ''
    const startTime = bookingPayload.startTime || ''
    const endTime = bookingPayload.endTime || ''
    const location = bookingPayload.location || bookingPayload.metadata?.videoCallUrl || ''
    const title = bookingPayload.title || ''

    // Attendee info
    const attendees = bookingPayload.attendees || []
    const attendee = attendees[0] || {}
    const attendeeEmail = attendee.email || ''
    const attendeeName = attendee.name || ''
    const attendeeTimezone = attendee.timeZone || ''

    // Organizer info
    const organizer = bookingPayload.organizer || {}

    // Try to match contact by email
    let contact = null
    if (attendeeEmail) {
      const { data } = await supabase
        .from('contacts')
        .select('id, email, first_name, last_name, client_id, campaign_id')
        .eq('email', attendeeEmail.toLowerCase())
        .limit(1)
        .single()
      contact = data
    }

    // Determine client_id from contact or organizer
    const clientId = contact?.client_id || null

    switch (triggerEvent) {
      case 'BOOKING_CREATED': {
        // Insert new meeting
        const { error } = await supabase.from('meetings').insert({
          client_id: clientId,
          contact_id: contact?.id || null,
          calcom_booking_id: bookingId,
          calcom_event_type: eventType,
          title: title || `Meeting with ${attendeeName}`,
          start_time: startTime,
          end_time: endTime,
          booking_status: 'booked',
          attendee_email: attendeeEmail,
          attendee_name: attendeeName,
          location: location,
          notes: `Booked via Cal.com. Timezone: ${attendeeTimezone}`,
        })

        if (error) {
          console.error('Meeting insert error:', error.message)
          throw error
        }

        // Update contact status if matched
        if (contact) {
          await supabase.from('contacts').update({
            lead_status: 'meeting_booked',
          }).eq('id', contact.id)
        }

        // Slack alert
        await sendSlackAlert(supabase, {
          channel: 'sales-alerts',
          text: `📅 *Meeting Booked!*\n*Attendee:* ${attendeeName} (${attendeeEmail})\n*Type:* ${eventType}\n*When:* ${formatDateTime(startTime)}\n*Location:* ${location || 'TBD'}\n${contact ? `_Matched to contact in Supabase._` : `_No matching contact found — manual review needed._`}`,
        })

        console.log(`Meeting created: ${attendeeName} (${attendeeEmail}) at ${startTime}`)
        break
      }

      case 'BOOKING_CANCELLED': {
        // Update meeting status
        if (bookingId) {
          const { error } = await supabase
            .from('meetings')
            .update({
              booking_status: 'cancelled',
              notes: `Cancelled. Reason: ${bookingPayload.cancellation?.reason || 'No reason given'}`,
            })
            .eq('calcom_booking_id', bookingId)

          if (error) console.error('Meeting cancel error:', error.message)
        }

        // Slack alert
        await sendSlackAlert(supabase, {
          channel: 'sales-alerts',
          text: `❌ *Meeting Cancelled*\n*Attendee:* ${attendeeName} (${attendeeEmail})\n*Was scheduled:* ${formatDateTime(startTime)}\n*Reason:* ${bookingPayload.cancellation?.reason || 'No reason'}`,
        })

        console.log(`Meeting cancelled: ${attendeeName} (${attendeeEmail})`)
        break
      }

      case 'BOOKING_RESCHEDULED': {
        // Update meeting with new time
        if (bookingId) {
          const { error } = await supabase
            .from('meetings')
            .update({
              start_time: startTime,
              end_time: endTime,
              booking_status: 'booked',
              location: location,
              notes: `Rescheduled from ${bookingPayload.rescheduleReason || 'unknown reason'}`,
            })
            .eq('calcom_booking_id', bookingId)

          if (error) console.error('Meeting reschedule error:', error.message)
        }

        // Slack alert
        await sendSlackAlert(supabase, {
          channel: 'sales-alerts',
          text: `🔄 *Meeting Rescheduled*\n*Attendee:* ${attendeeName} (${attendeeEmail})\n*New time:* ${formatDateTime(startTime)}`,
        })

        console.log(`Meeting rescheduled: ${attendeeName} at ${startTime}`)
        break
      }

      default:
        console.log(`Unhandled Cal.com event: ${triggerEvent}`)
    }

    // Log to agent_memory
    await supabase.from('agent_memory').insert({
      agent_id: 'webhook-calendar',
      memory_type: 'calendar_event',
      content: `Cal.com ${triggerEvent}: ${attendeeName} (${attendeeEmail}) — ${eventType}`,
      metadata: {
        trigger: triggerEvent,
        booking_id: bookingId,
        attendee_email: attendeeEmail,
        contact_id: contact?.id,
        client_id: clientId,
      },
    })

    return new Response(
      JSON.stringify({ success: true, event: triggerEvent, attendee: attendeeEmail }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Calendar webhook error:', (error as Error).message)

    await supabase.from('agent_memory').insert({
      agent_id: 'webhook-calendar',
      memory_type: 'webhook_error',
      content: `Calendar webhook error: ${(error as Error).message}`,
    }).catch(() => {})

    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

function formatDateTime(isoString: string): string {
  if (!isoString) return 'unknown'
  try {
    const d = new Date(isoString)
    return d.toLocaleString('nl-NL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Amsterdam',
    })
  } catch {
    return isoString
  }
}

async function sendSlackAlert(
  supabase: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>,
  { channel, text }: { channel: string; text: string }
) {
  const slackWebhookUrl = Deno.env.get('SLACK_WEBHOOK_URL')
  if (!slackWebhookUrl) {
    console.log(`Slack alert (no webhook): [${channel}] ${text}`)
    await supabase.from('agent_memory').insert({
      agent_id: 'webhook-calendar',
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
