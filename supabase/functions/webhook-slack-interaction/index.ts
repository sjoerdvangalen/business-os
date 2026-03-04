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
    return new Response('', { status: 200 }) // always ack Slack
  }

  try {
    // Slack sends application/x-www-form-urlencoded with a `payload` field
    const body = await req.text()
    const params = new URLSearchParams(body)
    const payloadStr = params.get('payload')
    if (!payloadStr) {
      return new Response('', { status: 200 })
    }

    const payload = JSON.parse(payloadStr)
    console.log(`Slack interaction: type=${payload.type}, user=${payload.user?.name}`)

    // Route by interaction type
    if (payload.type === 'block_actions') {
      const action = payload.actions?.[0]
      if (!action) return new Response('', { status: 200 })

      const meetingId = action.value
      const metadata = payload.message?.metadata?.event_payload || {}
      const channelId = payload.channel?.id
      const messageTs = payload.message?.ts
      const userId = payload.user?.id || ''
      const userName = payload.user?.name || payload.user?.username || 'unknown'

      console.log(`Action: ${action.action_id}, meeting: ${meetingId}, user: ${userName}`)

      switch (action.action_id) {
        case 'qualified':
          await handleDirectStatus(supabase, SLACK_BOT_TOKEN, {
            meetingId, status: 'qualified', userName, userId, channelId, messageTs,
            label: 'qualified',
          })
          break

        case 'unqualified':
          // Open modal for reason
          await openUnqualifiedModal(SLACK_BOT_TOKEN, payload.trigger_id, meetingId, metadata.client_id || '', channelId, messageTs)
          break

        case 'no_show':
          // Open modal for proof
          await openNoShowModal(SLACK_BOT_TOKEN, payload.trigger_id, meetingId, metadata.client_id || '', channelId, messageTs)
          break

        case 'reschedule':
          // Open modal for date/time
          await openRescheduleModal(SLACK_BOT_TOKEN, payload.trigger_id, meetingId, metadata.client_id || '', channelId, messageTs)
          break
      }

      return new Response('', { status: 200 })
    }

    if (payload.type === 'view_submission') {
      const callbackId = payload.view?.callback_id
      const privateMetadata = JSON.parse(payload.view?.private_metadata || '{}')
      const userId = payload.user?.id || ''
      const userName = payload.user?.name || payload.user?.username || 'unknown'

      console.log(`View submission: ${callbackId}, user: ${userName}`)

      switch (callbackId) {
        case 'no_show_modal':
          await handleNoShowSubmit(supabase, SLACK_BOT_TOKEN, payload, privateMetadata, userName, userId)
          break

        case 'unqualified_modal':
          await handleUnqualifiedSubmit(supabase, SLACK_BOT_TOKEN, payload, privateMetadata, userName, userId)
          break

        case 'reschedule_modal':
          await handleRescheduleSubmit(supabase, SLACK_BOT_TOKEN, payload, privateMetadata, userName, userId)
          break
      }

      // Return empty 200 to close the modal
      return new Response('', { status: 200 })
    }

    // Unknown interaction type — ack anyway
    return new Response('', { status: 200 })

  } catch (error) {
    console.error('webhook-slack-interaction error:', (error as Error).message)
    // Always return 200 to Slack to prevent retries
    return new Response('', { status: 200 })
  }
})

// ============================================================
// DIRECT STATUS HANDLERS (Qualified)
// ============================================================

async function handleDirectStatus(
  supabase: any, token: string,
  opts: { meetingId: string; status: string; userName: string; userId: string; channelId: string; messageTs: string; label: string }
) {
  const { meetingId, status, userName, userId, channelId, messageTs, label } = opts

  // Get meeting with contact/client info
  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, opportunity_id, contact_id, client_id, attendee_name, attendee_email, start_time, end_time, review_slack_ts')
    .eq('id', meetingId)
    .maybeSingle()

  if (!meeting) {
    console.error(`Meeting not found: ${meetingId}`)
    return
  }

  // Update meeting status
  await supabase.from('meetings').update({
    booking_status: status,
    reviewed_at: new Date().toISOString(),
    reviewed_by: userName,
    review_status: 'reviewed',
  }).eq('id', meetingId)

  // Update opportunity status (1-on-1 mirroring)
  if (meeting.opportunity_id) {
    await supabase.from('opportunities').update({
      status,
    }).eq('id', meeting.opportunity_id)
  }

  // Get contact + client for message update
  const contactName = await getContactName(supabase, meeting)
  const messageBlocks = await buildUpdatedMessage(supabase, meeting, label, userId)

  // Update original Slack message (remove buttons, show result)
  const slackTs = meeting.review_slack_ts || messageTs
  if (channelId && slackTs) {
    await slackChatUpdate(token, channelId, slackTs, messageBlocks,
      `Meeting Review: ${contactName} — ${label} by ${userName}`)
  }

  console.log(`Meeting ${meetingId} → ${status} by ${userName}`)
}

// ============================================================
// NO-SHOW MODAL
// ============================================================

async function openNoShowModal(token: string, triggerId: string, meetingId: string, clientId: string, channelId: string, messageTs: string) {
  const res = await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      trigger_id: triggerId,
      view: {
        type: 'modal',
        callback_id: 'no_show_modal',
        private_metadata: JSON.stringify({ meeting_id: meetingId, client_id: clientId, channel_id: channelId, message_ts: messageTs }),
        title: { type: 'plain_text', text: 'No-Show Report' },
        submit: { type: 'plain_text', text: 'Submit' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: 'Please provide evidence that the prospect did not show up for the meeting. VGG will review and has the final decision.' }
          },
          {
            type: 'input',
            block_id: 'no_show_proof',
            label: { type: 'plain_text', text: 'Evidence / Notes' },
            element: {
              type: 'plain_text_input',
              action_id: 'proof_text',
              multiline: true,
              placeholder: { type: 'plain_text', text: 'Describe what happened (e.g. waited 10 min, no one joined, no response to follow-up)...' }
            }
          }
        ]
      }
    })
  })
  const data = await res.json()
  if (!data.ok) console.error('views.open no_show failed:', data.error)
}

async function handleNoShowSubmit(supabase: any, token: string, payload: any, metadata: any, userName: string, userId: string) {
  const meetingId = metadata.meeting_id
  const clientId = metadata.client_id
  const channelId = metadata.channel_id
  const messageTs = metadata.message_ts

  // Extract proof text
  const proofText = payload.view?.state?.values?.no_show_proof?.proof_text?.value || 'No details provided'

  // Get meeting
  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, opportunity_id, contact_id, client_id, attendee_name, attendee_email, start_time, end_time, review_slack_ts')
    .eq('id', meetingId)
    .maybeSingle()

  if (!meeting) {
    console.error(`No-show submit: meeting not found ${meetingId}`)
    return
  }

  // Update meeting
  await supabase.from('meetings').update({
    booking_status: 'no_show',
    reviewed_at: new Date().toISOString(),
    reviewed_by: userName,
    review_status: 'reviewed',
    review_notes: proofText,
  }).eq('id', meetingId)

  // Update opportunity
  if (meeting.opportunity_id) {
    await supabase.from('opportunities').update({
      status: 'no_show',
    }).eq('id', meeting.opportunity_id)
  }

  // Get client info for alert
  const { data: client } = await supabase
    .from('clients')
    .select('client_code, slack_channel_id')
    .eq('id', meeting.client_id)
    .maybeSingle()

  const contactName = meeting.attendee_name || meeting.attendee_email || 'Unknown'
  const clientCode = client?.client_code || 'UNKNOWN'

  // Update original message
  const slackTs = meeting.review_slack_ts || messageTs
  if (channelId && slackTs) {
    const messageBlocks = await buildUpdatedMessage(supabase, meeting, 'no-show', userId)
    await slackChatUpdate(token, channelId, slackTs, messageBlocks,
      `Meeting Review: ${contactName} — no-show by ${userName}`)
  }

  // Alert to #sales-alerts
  const alertChannel = Deno.env.get('SLACK_ALERTS_CHANNEL') || '#sales-alerts'
  await slackPostMessage(token, alertChannel,
    `*No-Show Claim* [${clientCode}]\n` +
    `*Contact:* ${contactName} (${meeting.attendee_email})\n` +
    `*Meeting:* ${fmtDt(meeting.start_time)}\n` +
    `*Reported by:* ${userName}\n` +
    `*Evidence:* ${proofText}\n` +
    `_VGG has final say on no-show claims_`
  )

  console.log(`No-show submitted for meeting ${meetingId} by ${userName}`)
}

// ============================================================
// UNQUALIFIED MODAL
// ============================================================

async function openUnqualifiedModal(token: string, triggerId: string, meetingId: string, clientId: string, channelId: string, messageTs: string) {
  const res = await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      trigger_id: triggerId,
      view: {
        type: 'modal',
        callback_id: 'unqualified_modal',
        private_metadata: JSON.stringify({ meeting_id: meetingId, client_id: clientId, channel_id: channelId, message_ts: messageTs }),
        title: { type: 'plain_text', text: 'Unqualified' },
        submit: { type: 'plain_text', text: 'Submit' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: 'Please provide the reason why this meeting was unqualified and upload the meeting recording.' }
          },
          {
            type: 'input',
            block_id: 'unqualified_reason',
            label: { type: 'plain_text', text: 'Reason' },
            element: {
              type: 'plain_text_input',
              action_id: 'reason_text',
              multiline: true,
              placeholder: { type: 'plain_text', text: 'Describe why this lead is unqualified (e.g. wrong ICP, no budget, not decision maker)...' }
            }
          },
          {
            type: 'input',
            block_id: 'unqualified_recording',
            label: { type: 'plain_text', text: 'Meeting Recording URL' },
            element: {
              type: 'url_text_input',
              action_id: 'recording_url',
              placeholder: { type: 'plain_text', text: 'Paste the link to the meeting recording (Google Drive, Loom, etc.)' }
            }
          }
        ]
      }
    })
  })
  const data = await res.json()
  if (!data.ok) console.error('views.open unqualified failed:', data.error)
}

async function handleUnqualifiedSubmit(supabase: any, token: string, payload: any, metadata: any, userName: string, userId: string) {
  const meetingId = metadata.meeting_id
  const channelId = metadata.channel_id
  const messageTs = metadata.message_ts

  // Extract reason text
  const reasonText = payload.view?.state?.values?.unqualified_reason?.reason_text?.value || 'No reason provided'

  // Extract recording URL
  const recordingUrl = payload.view?.state?.values?.unqualified_recording?.recording_url?.value || null

  // Get meeting
  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, opportunity_id, contact_id, client_id, attendee_name, attendee_email, start_time, end_time, review_slack_ts')
    .eq('id', meetingId)
    .maybeSingle()

  if (!meeting) {
    console.error(`Unqualified submit: meeting not found ${meetingId}`)
    return
  }

  // Update meeting
  await supabase.from('meetings').update({
    booking_status: 'unqualified',
    reviewed_at: new Date().toISOString(),
    reviewed_by: userName,
    review_status: 'reviewed',
    review_notes: reasonText,
    ...(recordingUrl ? { recording_url: recordingUrl } : {}),
  }).eq('id', meetingId)

  // Update opportunity
  if (meeting.opportunity_id) {
    await supabase.from('opportunities').update({
      status: 'unqualified',
    }).eq('id', meeting.opportunity_id)
  }

  // Update original message
  const slackTs = meeting.review_slack_ts || messageTs
  if (channelId && slackTs) {
    const messageBlocks = await buildUpdatedMessage(supabase, meeting, 'unqualified', userId)
    await slackChatUpdate(token, channelId, slackTs, messageBlocks,
      `Meeting Review: ${meeting.attendee_name || 'Unknown'} — unqualified by ${userName}`)
  }

  // Alert to #sales-alerts with reason
  const { data: client } = await supabase
    .from('clients')
    .select('client_code')
    .eq('id', meeting.client_id)
    .maybeSingle()

  const contactName = meeting.attendee_name || meeting.attendee_email || 'Unknown'
  const clientCode = client?.client_code || 'UNKNOWN'

  const alertChannel = Deno.env.get('SLACK_ALERTS_CHANNEL') || '#sales-alerts'
  await slackPostMessage(token, alertChannel,
    `*Unqualified* [${clientCode}]\n` +
    `*Contact:* ${contactName} (${meeting.attendee_email})\n` +
    `*Meeting:* ${fmtDt(meeting.start_time)}\n` +
    `*Reported by:* ${userName}\n` +
    `*Reason:* ${reasonText}` +
    (recordingUrl ? `\n*Recording:* ${recordingUrl}` : '')
  )

  console.log(`Unqualified submitted for meeting ${meetingId} by ${userName}`)
}

// ============================================================
// RESCHEDULE MODAL
// ============================================================

async function openRescheduleModal(token: string, triggerId: string, meetingId: string, clientId: string, channelId: string, messageTs: string) {
  const res = await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      trigger_id: triggerId,
      view: {
        type: 'modal',
        callback_id: 'reschedule_modal',
        private_metadata: JSON.stringify({ meeting_id: meetingId, client_id: clientId, channel_id: channelId, message_ts: messageTs }),
        title: { type: 'plain_text', text: 'Reschedule Meeting' },
        submit: { type: 'plain_text', text: 'Submit' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: 'Select the new meeting date and time:' }
          },
          {
            type: 'input',
            block_id: 'reschedule_date_block',
            label: { type: 'plain_text', text: 'New Date' },
            element: {
              type: 'datepicker',
              action_id: 'reschedule_date',
              placeholder: { type: 'plain_text', text: 'Select date' }
            }
          },
          {
            type: 'input',
            block_id: 'reschedule_time_block',
            label: { type: 'plain_text', text: 'New Time' },
            element: {
              type: 'static_select',
              action_id: 'reschedule_time',
              placeholder: { type: 'plain_text', text: 'Select time' },
              options: generateTimeOptions(),
            }
          }
        ]
      }
    })
  })
  const data = await res.json()
  if (!data.ok) console.error('views.open reschedule failed:', data.error)
}

async function handleRescheduleSubmit(supabase: any, token: string, payload: any, metadata: any, userName: string, userId: string) {
  const meetingId = metadata.meeting_id
  const channelId = metadata.channel_id
  const messageTs = metadata.message_ts

  // Extract date and time from modal
  const selectedDate = payload.view?.state?.values?.reschedule_date_block?.reschedule_date?.selected_date // "2026-03-15"
  const selectedTime = payload.view?.state?.values?.reschedule_time_block?.reschedule_time?.selected_option?.value // "14:00"

  if (!selectedDate || !selectedTime) {
    console.error('Reschedule: missing date or time')
    return
  }

  // Parse as Amsterdam time → convert to UTC
  // Create date in Europe/Amsterdam timezone
  const localDateStr = `${selectedDate}T${selectedTime}:00`
  // Use a simple offset approach: CET = UTC+1, CEST = UTC+2
  const tempDate = new Date(localDateStr + 'Z') // treat as UTC first
  const startTime = adjustAmsterdamToUTC(tempDate)
  const endTime = new Date(startTime.getTime() + 30 * 60 * 1000) // +30 min
  const reviewAt = new Date(startTime.getTime() + 30 * 60 * 1000) // review 30 min after start

  // Get meeting
  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, opportunity_id, contact_id, client_id, attendee_name, attendee_email, start_time, end_time, review_slack_ts')
    .eq('id', meetingId)
    .maybeSingle()

  if (!meeting) {
    console.error(`Reschedule submit: meeting not found ${meetingId}`)
    return
  }

  // Update meeting with new times + reset review cycle
  await supabase.from('meetings').update({
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    booking_status: 'rescheduled',
    review_scheduled_at: reviewAt.toISOString(),
    review_slack_ts: null, // clear so a new review message will be sent
    reviewed_at: null,
    review_status: 'pending',
  }).eq('id', meetingId)

  // Update opportunity
  if (meeting.opportunity_id) {
    await supabase.from('opportunities').update({
      status: 'rescheduled',
    }).eq('id', meeting.opportunity_id)
  }

  // Format new time for display
  const newTimeFormatted = fmtDt(startTime.toISOString())

  // Update original Slack message
  const slackTs = meeting.review_slack_ts || messageTs
  if (channelId && slackTs) {
    const contactName = meeting.attendee_name || meeting.attendee_email || 'Unknown'
    const messageBlocks = await buildUpdatedMessage(supabase, meeting, `rescheduled to ${newTimeFormatted}`, userId)

    await slackChatUpdate(token, channelId, slackTs, messageBlocks,
      `Meeting Review: ${contactName} — rescheduled to ${newTimeFormatted} by ${userName}`)
  }

  console.log(`Meeting ${meetingId} rescheduled to ${selectedDate} ${selectedTime} by ${userName}`)
}

// ============================================================
// SLACK API HELPERS
// ============================================================

async function slackChatUpdate(token: string, channel: string, ts: string, blocks: any[], fallbackText: string) {
  const res = await fetch('https://slack.com/api/chat.update', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, ts, text: fallbackText, blocks }),
  })
  const data = await res.json()
  if (!data.ok) console.error('chat.update failed:', data.error)
  return data
}

async function slackReactionAdd(token: string, channel: string, ts: string, name: string) {
  try {
    await fetch('https://slack.com/api/reactions.add', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, timestamp: ts, name }),
    })
  } catch (_) { /* non-critical */ }
}

async function slackPostThread(token: string, channel: string, threadTs: string, text: string) {
  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, thread_ts: threadTs, text }),
    })
  } catch (_) { /* non-critical */ }
}

async function slackPostMessage(token: string, channel: string, text: string) {
  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, text }),
    })
  } catch (_) { /* non-critical */ }
}

// ============================================================
// MESSAGE BUILDERS
// ============================================================

async function buildUpdatedMessage(supabase: any, meeting: any, statusLabel: string, userId: string): Promise<any[]> {
  // Get contact details for the updated message
  let contact: any = null
  if (meeting.contact_id) {
    const { data } = await supabase
      .from('contacts')
      .select('full_name, email, company_name, company_domain')
      .eq('id', meeting.contact_id)
      .maybeSingle()
    contact = data
  }

  const contactName = contact?.full_name || meeting.attendee_name || 'Unknown'
  const contactEmail = contact?.email || meeting.attendee_email || 'Unknown'
  const companyName = contact?.company_name || extractDomainName(contactEmail) || '-'
  const companyDomain = contact?.company_domain || extractDomain(contactEmail) || '-'

  return [
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
        { type: 'mrkdwn', text: `*Start:*\n${fmtDt(meeting.start_time)}` },
        { type: 'mrkdwn', text: `*End:*\n${fmtDt(meeting.end_time)}` },
      ]
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `This meeting has been marked as ${statusLabel} by <@${userId}>`
      }
    }
  ]
}

async function getContactName(supabase: any, meeting: any): Promise<string> {
  if (meeting.contact_id) {
    const { data } = await supabase
      .from('contacts')
      .select('full_name')
      .eq('id', meeting.contact_id)
      .maybeSingle()
    if (data?.full_name) return data.full_name
  }
  return meeting.attendee_name || meeting.attendee_email || 'Unknown'
}

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

/**
 * Generate 30-minute interval time options for the reschedule modal.
 * Returns options from 08:00 to 18:30.
 */
function generateTimeOptions(): Array<{ text: { type: string; text: string }; value: string }> {
  const options = []
  for (let h = 8; h <= 18; h++) {
    for (const m of [0, 30]) {
      if (h === 18 && m > 30) break
      const hh = String(h).padStart(2, '0')
      const mm = String(m).padStart(2, '0')
      const label = `${hh}:${mm}`
      options.push({
        text: { type: 'plain_text' as const, text: label },
        value: label,
      })
    }
  }
  return options
}

/**
 * Convert Amsterdam local time to UTC.
 * Handles CET (UTC+1) and CEST (UTC+2) transitions.
 */
function adjustAmsterdamToUTC(localDate: Date): Date {
  // Use the Intl API to find the actual offset
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Amsterdam',
    timeZoneName: 'shortOffset',
  })
  const parts = formatter.formatToParts(localDate)
  const offsetPart = parts.find(p => p.type === 'timeZoneName')
  // offsetPart.value is like "GMT+1" or "GMT+2"
  const offsetMatch = offsetPart?.value?.match(/GMT([+-]\d+)/)
  const offsetHours = offsetMatch ? parseInt(offsetMatch[1]) : 1 // default CET
  // localDate is treated as UTC, so subtract the offset to get real UTC
  return new Date(localDate.getTime() - offsetHours * 60 * 60 * 1000)
}
