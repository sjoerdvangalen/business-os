import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')
  if (!SLACK_BOT_TOKEN) {
    console.error('SLACK_BOT_TOKEN not configured')
    return new Response(JSON.stringify({ error: 'SLACK_BOT_TOKEN not configured' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500
    })
  }

  try {
    // Query meetings ready for review:
    // - review_scheduled_at has passed
    // - still in booked/rescheduled status (meeting happened but not yet reviewed)
    // - no review sent yet (review_slack_ts is null)
    // - not yet reviewed
    // - client has a slack channel
    const { data: meetings, error: queryErr } = await supabase
      .from('meetings')
      .select(`
        id, name, start_time, end_time, booking_status, attendee_email, attendee_name,
        review_scheduled_at, opportunity_id,
        contact_id, client_id
      `)
      .lte('review_scheduled_at', new Date().toISOString())
      .in('booking_status', ['booked', 'rescheduled'])
      .is('reviewed_at', null)
      .is('review_slack_ts', null)
      .order('review_scheduled_at', { ascending: true })
      .limit(20)

    if (queryErr) throw new Error(`Query failed: ${queryErr.message}`)

    if (!meetings || meetings.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No reviews pending', count: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let sent = 0
    let skipped = 0

    for (const meeting of meetings) {
      try {
        // Get contact details
        let contact: any = null
        if (meeting.contact_id) {
          const { data } = await supabase
            .from('contacts')
            .select('first_name, last_name, full_name, email, company_name, company_domain')
            .eq('id', meeting.contact_id)
            .maybeSingle()
          contact = data
        }

        // Get client details
        let client: any = null
        if (meeting.client_id) {
          const { data } = await supabase
            .from('clients')
            .select('id, client_code, name, slack_channel_id')
            .eq('id', meeting.client_id)
            .maybeSingle()
          client = data
        }

        // Determine target channel: use TEST override or client channel
        const TEST_CHANNEL = Deno.env.get('SLACK_TEST_CHANNEL') // set during testing, remove for production
        const targetChannel = TEST_CHANNEL || client?.slack_channel_id

        if (!targetChannel) {
          console.log(`Skipping meeting ${meeting.id}: no slack channel for client ${client?.client_code || 'unknown'}`)
          await supabase.from('meetings').update({
            review_slack_ts: 'NO_CHANNEL',
          }).eq('id', meeting.id)
          skipped++
          continue
        }

        // Build contact info for the message
        const contactName = contact?.full_name || meeting.attendee_name || 'Unknown'
        const contactEmail = contact?.email || meeting.attendee_email || 'Unknown'
        const companyName = contact?.company_name || extractDomainName(contactEmail) || '-'
        const companyDomain = contact?.company_domain || extractDomain(contactEmail) || '-'

        // Format times in Amsterdam timezone
        const startFormatted = fmtDt(meeting.start_time)
        const endFormatted = fmtDt(meeting.end_time)

        // Build Block Kit message
        const blocks = [
          {
            type: 'header',
            text: { type: 'plain_text', text: `Meeting Review: ${contactName}`, emoji: true }
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Name:*\n${contactName}` },
              { type: 'mrkdwn', text: `*Email:*\n${contactEmail}` },
              { type: 'mrkdwn', text: `*Company:*\n${companyName}` },
              { type: 'mrkdwn', text: `*Domain:*\n${companyDomain}` },
              { type: 'mrkdwn', text: `*Start:*\n${startFormatted}` },
              { type: 'mrkdwn', text: `*End:*\n${endFormatted}` },
            ]
          },
          { type: 'divider' },
          {
            type: 'actions',
            block_id: 'meeting_review_actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Qualified', emoji: true },
                style: 'primary',
                action_id: 'qualified',
                value: meeting.id,
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Unqualified', emoji: true },
                style: 'danger',
                action_id: 'unqualified',
                value: meeting.id,
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'No-Show', emoji: true },
                action_id: 'no_show',
                value: meeting.id,
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Rescheduled', emoji: true },
                action_id: 'reschedule',
                value: meeting.id,
              },
            ]
          }
        ]

        // Send to Slack
        const slackRes = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            channel: targetChannel,
            text: `Meeting Review: ${contactName} (${contactEmail})`, // fallback text
            unfurl_links: false,
            unfurl_media: false,
            metadata: {
              event_type: 'meeting_review',
              event_payload: {
                meeting_id: meeting.id,
                client_id: client.id,
              }
            },
            blocks,
          }),
        })

        const slackData = await slackRes.json()

        if (!slackData.ok) {
          console.error(`Slack error for meeting ${meeting.id}:`, slackData.error)
          // Store error but don't retry immediately
          await supabase.from('meetings').update({
            review_slack_ts: `ERROR:${slackData.error}`,
          }).eq('id', meeting.id)
          skipped++
          continue
        }

        // Store the Slack message timestamp for later updates
        await supabase.from('meetings').update({
          review_slack_ts: slackData.ts,
        }).eq('id', meeting.id)

        sent++
        console.log(`Review sent for meeting ${meeting.id} → channel ${client.slack_channel_id} (ts: ${slackData.ts})`)

      } catch (meetingErr) {
        console.error(`Error processing meeting ${meeting.id}:`, (meetingErr as Error).message)
        skipped++
      }
    }

    // Log to sync_log
    await supabase.from('sync_log').insert({
      function_name: 'meeting-review',
      status: 'success',
      records_processed: sent,
      details: { sent, skipped, total: meetings.length },
    }).then(() => {})

    return new Response(
      JSON.stringify({ success: true, sent, skipped, total: meetings.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const msg = (error as Error).message || 'Unknown error'
    console.error('meeting-review error:', msg)

    await supabase.from('sync_log').insert({
      function_name: 'meeting-review',
      status: 'error',
      error_message: msg,
    }).then(() => {})

    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

// ============================================================
// HELPERS
// ============================================================

function fmtDt(s: string): string {
  if (!s) return 'unknown'
  try {
    return new Date(s).toLocaleString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Europe/Amsterdam',
    })
  } catch {
    return s
  }
}

function extractDomainName(email: string): string {
  if (!email?.includes('@')) return ''
  return email.split('@')[1].split('.')[0]
}

function extractDomain(email: string): string {
  if (!email?.includes('@')) return ''
  return email.split('@')[1]
}
