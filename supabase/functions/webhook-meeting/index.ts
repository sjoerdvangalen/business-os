import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PLUSVIBE_API_KEY = Deno.env.get('PLUSVIBE_API_KEY') || ''
const PLUSVIBE_WORKSPACE = Deno.env.get('PLUSVIBE_WORKSPACE_ID') || '68f8e5d7e13f67d591c4f0a8'

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let supabase: any
  try {
    supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Supabase init failed', msg: (e as Error).message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    })
  }

  try {
    // STEP 1: Parse URL + body
    const url = new URL(req.url)
    const token = url.searchParams.get('token')
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing token' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400
      })
    }

    const rawPayload = await req.json()

    // STEP 2: Lookup client by calendar webhook token
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name, client_code, slack_channel_id, calendar_type, calendar_webhook_count')
      .eq('calendar_webhook_token', token)
      .single()

    if (clientError || !client) {
      return new Response(JSON.stringify({ error: 'Invalid token', detail: clientError?.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404
      })
    }

    // Update stats (fire-and-forget)
    supabase.from('clients').update({
      calendar_last_webhook: new Date().toISOString(),
      calendar_webhook_count: (client.calendar_webhook_count || 0) + 1,
    }).eq('id', client.id).then(() => {})

    const clientCode = client.client_code || 'UNKNOWN'

    // STEP 4: Normalize payload
    const normalized = normalizePayload(client.calendar_type, rawPayload)
    if (!normalized) {
      return new Response(JSON.stringify({ success: true, message: 'Event not handled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // STEP 5: Dedup
    if (normalized.bookingId && normalized.event === 'created') {
      const { data: existing } = await supabase
        .from('meetings')
        .select('id')
        .eq('provider_booking_id', normalized.bookingId)
        .maybeSingle()

      if (existing) {
        return new Response(JSON.stringify({ success: true, message: 'Already exists' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    // STEP 6: Handle event
    let meetingId: string | null = null
    if (normalized.event === 'created') {
      meetingId = await handleCreated(supabase, client, clientCode, normalized)
    } else if (normalized.event === 'cancelled') {
      meetingId = await handleCancelled(supabase, client, clientCode, normalized)
    } else if (normalized.event === 'rescheduled') {
      meetingId = await handleRescheduled(supabase, client, clientCode, normalized)
    }

    return new Response(
      JSON.stringify({ success: true, event: normalized.event, client: clientCode, meeting_id: meetingId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const msg = (error as Error).message || 'Unknown error'
    console.error('FATAL:', msg)


    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

// ============================================================
// EVENT HANDLERS
// ============================================================

async function handleCreated(
  supabase: any,
  client: any,
  clientCode: string,
  n: NormalizedMeeting
): Promise<string | null> {
  // Match contact
  let contact: any = null
  if (n.attendeeEmail) {
    const { data } = await supabase
      .from('contacts')
      .select('id, email, first_name, last_name, full_name, client_id, last_campaign_id, source_id')
      .eq('email', n.attendeeEmail.toLowerCase())
      .limit(1)
      .maybeSingle()
    contact = data
  }

  if (!contact && n.attendeeName && client?.id) {
    const { data } = await supabase
      .from('contacts')
      .select('id, email, first_name, last_name, full_name, client_id, last_campaign_id, source_id')
      .eq('client_id', client.id)
      .eq('full_name', n.attendeeName)
      .limit(1)
      .maybeSingle()
    contact = data
  }

  // Update PlusVibe — source_id is de plusvibe_lead_id, last_campaign_id geeft de campaign context
  if (contact?.source_id && contact?.email) {
    // Haal plusvibe campaign_id op via leads
    const { data: cc } = await supabase
      .from('leads')
      .select('plusvibe_lead_id')
      .eq('contact_id', contact.id)
      .not('plusvibe_lead_id', 'is', null)
      .order('added_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (cc?.plusvibe_lead_id) {
      // Bepaal plusvibe campaign_id via campaigns tabel
      const { data: camp } = await supabase
        .from('campaigns')
        .select('provider_campaign_id')
        .eq('id', contact.last_campaign_id)
        .eq('provider', 'plusvibe')
        .maybeSingle()
      if (camp?.provider_campaign_id) {
        await updatePlusVibeLead(contact.email, camp.provider_campaign_id)
      }
    }
  }
  await updatePlusVibeByDomain(supabase, n.attendeeEmail)

  // Update contact
  if (contact) {
    await supabase.from('contacts').update({
      contact_status: 'meeting_booked',
      meetings_booked_count: 1,
    }).eq('id', contact.id)
  }

  // Find or create opportunity
  const companyName = extractDomainName(n.attendeeEmail) || n.attendeeName || 'Unknown'
  let opp: any = null
  let oppIsNew = false

  // Check existing: match on contact_id + client_id (same person, same client = same deal)
  if (contact?.id && client?.id) {
    const { data: existing } = await supabase.from('opportunities')
      .select('id, status')
      .eq('lead_id', contact.id)
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    opp = existing
  }

  if (opp) {
    // Update existing opportunity
    await supabase.from('opportunities').update({
      status: 'meeting_booked',
    }).eq('id', opp.id)
    console.log(`Opportunity updated: ${opp.id} → meeting_booked`)
  } else {
    // Create new opportunity
    const { data: newOpp, error: oppErr } = await supabase.from('opportunities').insert({
      client_id: client?.id || null,
      lead_id: contact?.id || null,
      campaign_id: contact?.campaign_id || null,
      name: companyName,
      status: 'meeting_booked',
      source: 'cold_email',
    }).select('id').single()

    if (oppErr) {
      console.error('Opportunity insert failed:', oppErr.message)
    } else {
      opp = newOpp
      oppIsNew = true
    }
  }

  // Calculate review time (30 min after meeting start)
  const reviewAt = n.startTime ? new Date(new Date(n.startTime).getTime() + 30 * 60 * 1000).toISOString() : null

  // Create meeting (link to opportunity)
  const { data: meeting, error: meetErr } = await supabase.from('meetings').insert({
    client_id: client?.id || null,
    lead_id: contact?.id || null,
    opportunity_id: opp?.id || null,
    integration_type: client.calendar_type,
    source: client.calendar_type,
    name: n.title || `Meeting with ${n.attendeeName}`,
    start_time: n.startTime, end_time: n.endTime,
    booking_status: 'booked',
    attendee_email: n.attendeeEmail, attendee_name: n.attendeeName,
    location: n.location,
    provider_booking_id: n.bookingId, provider_event_type: n.eventType,
    calcom_booking_id: client.calendar_type === 'calcom' ? n.bookingId : null,
    calcom_event_type: client.calendar_type === 'calcom' ? n.eventType : null,
    review_scheduled_at: reviewAt,
    review_status: 'pending',
  }).select('id').single()
  if (meetErr) throw new Error(`Meeting insert: ${meetErr.message}`)

  // Link opportunity → meeting (update to latest meeting)
  if (opp?.id && meeting?.id) {
    await supabase.from('opportunities').update({
      meeting_id: meeting.id,
    }).eq('id', opp.id)
  }


  // Slack
  const oppLabel = opp ? (oppIsNew ? '✅ _New opportunity_' : '🔄 _Existing opportunity updated_') : '⚠️ _Opportunity failed_'
  await sendSlackAlert(supabase, client,
    `📅 *Meeting Booked!* [${clientCode}]\n*Via:* ${client.calendar_type || 'calendar'}\n` +
    `*Attendee:* ${n.attendeeName} (${n.attendeeEmail})\n*Company:* ${companyName}\n` +
    `*Type:* ${n.eventType || 'Meeting'}\n*When:* ${fmtDt(n.startTime)}\n` +
    `*Location:* ${n.location || 'TBD'}\n` +
    `${oppLabel}\n` +
    (contact ? `_Matched: ${contact.full_name || contact.email}_` : `_⚠️ No contact match_`)
  )

  return meeting?.id || null
}

async function handleCancelled(
  supabase: any,
  client: any,
  clientCode: string,
  n: NormalizedMeeting
): Promise<string | null> {
  if (!n.bookingId) return null

  // Get the meeting to find linked opportunity
  const { data: meeting } = await supabase.from('meetings')
    .select('id, opportunity_id, client_id')
    .eq('provider_booking_id', n.bookingId)
    .maybeSingle()

  // Update meeting status + clear review timer
  await supabase.from('meetings').update({
    booking_status: 'cancelled',
    review_notes: `Cancelled: ${n.cancellationReason || 'No reason'}`,
    review_scheduled_at: null, // no review needed for cancelled meetings
  }).eq('provider_booking_id', n.bookingId)

  // Update opportunity status to match
  if (meeting?.opportunity_id) {
    await supabase.from('opportunities').update({
      status: 'cancelled',
    }).eq('id', meeting.opportunity_id)
  }


  await sendSlackAlert(supabase, client,
    `❌ *Meeting Cancelled* [${clientCode}]\n*Via:* ${client.calendar_type || 'calendar'}\n` +
    `*Attendee:* ${n.attendeeName} (${n.attendeeEmail})\n*Was:* ${fmtDt(n.startTime)}\n` +
    `*Reason:* ${n.cancellationReason || 'No reason given'}`
  )

  return meeting?.id || null
}

async function handleRescheduled(
  supabase: any,
  client: any,
  clientCode: string,
  n: NormalizedMeeting
): Promise<string | null> {
  if (!n.bookingId) return null

  // Get the meeting to find linked opportunity
  const { data: meeting } = await supabase.from('meetings')
    .select('id, opportunity_id, client_id')
    .eq('provider_booking_id', n.bookingId)
    .maybeSingle()

  // Calculate new review time (30 min after new meeting start)
  const reviewAt = n.startTime ? new Date(new Date(n.startTime).getTime() + 30 * 60 * 1000).toISOString() : null

  // Update meeting with new times + reset review timer
  await supabase.from('meetings').update({
    start_time: n.startTime, end_time: n.endTime,
    booking_status: 'rescheduled', location: n.location,
    review_scheduled_at: reviewAt,
    review_slack_ts: null, // clear old review message reference
    reviewed_at: null, // reset review
    review_status: 'pending',
  }).eq('provider_booking_id', n.bookingId)

  // Update opportunity status to match
  if (meeting?.opportunity_id) {
    await supabase.from('opportunities').update({
      status: 'rescheduled',
    }).eq('id', meeting.opportunity_id)
  }


  await sendSlackAlert(supabase, client,
    `🔄 *Meeting Rescheduled* [${clientCode}]\n*Via:* ${client.calendar_type || 'calendar'}\n` +
    `*Attendee:* ${n.attendeeName} (${n.attendeeEmail})\n*New time:* ${fmtDt(n.startTime)}\n` +
    `_Review timer reset to ${fmtDt(reviewAt || '')}_`
  )

  return meeting?.id || null
}

// ============================================================
// NORMALIZERS
// ============================================================
interface NormalizedMeeting {
  event: 'created' | 'cancelled' | 'rescheduled'
  bookingId: string; title: string; eventType: string
  startTime: string; endTime: string; location: string
  attendeeEmail: string; attendeeName: string; attendeeTimezone: string
  cancellationReason?: string
}

function normalizePayload(type: string, raw: any): NormalizedMeeting | null {
  if (type === 'calcom') return normCalcom(raw)
  if (type === 'calendly') return normCalendly(raw)
  if (type === 'gohighlevel') return normGHL(raw)
  return normGeneric(raw)
}

function normCalcom(raw: any): NormalizedMeeting | null {
  const t = raw.triggerEvent || ''
  const p = raw.payload || raw
  const ev = t === 'BOOKING_CREATED' ? 'created' : t === 'BOOKING_CANCELLED' ? 'cancelled' : t === 'BOOKING_RESCHEDULED' ? 'rescheduled' : null
  if (!ev) return null
  const a = p.attendees?.[0] || {}
  return { event: ev as any, bookingId: p.uid || p.bookingId || '', title: p.title || '',
    eventType: p.type || p.eventType?.title || '', startTime: p.startTime || '', endTime: p.endTime || '',
    location: p.location || p.metadata?.videoCallUrl || '',
    attendeeEmail: (a.email || '').toLowerCase().trim(), attendeeName: a.name || '',
    attendeeTimezone: a.timeZone || '', cancellationReason: p.cancellation?.reason }
}

function normCalendly(raw: any): NormalizedMeeting | null {
  const e = raw.event || ''
  const p = raw.payload || {}
  const ev = e === 'invitee.created' ? 'created' : (e === 'invitee.canceled' || e === 'invitee.cancelled') ? 'cancelled' : null
  if (!ev) return null
  const se = p.scheduled_event || {}
  return { event: ev as any, bookingId: p.uri || p.uuid || '', title: se.name || '',
    eventType: se.event_type || '', startTime: se.start_time || '', endTime: se.end_time || '',
    location: se.location?.join_url || se.location?.location || '',
    attendeeEmail: (p.email || '').toLowerCase().trim(), attendeeName: p.name || '',
    attendeeTimezone: p.timezone || '', cancellationReason: p.cancellation?.reason }
}

function normGHL(raw: any): NormalizedMeeting | null {
  const t = raw.type || ''
  const ev = (t === 'AppointmentCreate' || t === 'appointment.create') ? 'created'
    : (t === 'AppointmentDelete' || t === 'appointment.delete') ? 'cancelled'
    : (t === 'AppointmentUpdate' || t === 'appointment.update') ? 'rescheduled' : null
  if (!ev) return null
  const c = raw.contact || {}
  return { event: ev as any, bookingId: raw.id || raw.appointmentId || '', title: raw.title || raw.calendarName || '',
    eventType: raw.calendarName || '', startTime: raw.startTime || raw.start_time || '', endTime: raw.endTime || raw.end_time || '',
    location: raw.address || raw.location || '',
    attendeeEmail: (c.email || raw.email || '').toLowerCase().trim(),
    attendeeName: c.name || (c.firstName ? `${c.firstName} ${c.lastName || ''}`.trim() : ''),
    attendeeTimezone: c.timezone || '', cancellationReason: raw.cancellationReason }
}

function normGeneric(raw: any): NormalizedMeeting | null {
  const em = raw.email || raw.attendee_email || raw.attendees?.[0]?.email || ''
  if (!em) return null
  return { event: 'created', bookingId: raw.id || raw.uid || '', title: raw.title || '',
    eventType: raw.type || '', startTime: raw.start_time || raw.startTime || '', endTime: raw.end_time || raw.endTime || '',
    location: raw.location || '', attendeeEmail: em.toLowerCase().trim(),
    attendeeName: raw.name || raw.attendee_name || '', attendeeTimezone: '' }
}

// ============================================================
// PLUSVIBE
// ============================================================
async function updatePlusVibeLead(email: string, campaignId: string) {
  try {
    await fetch('https://api.plusvibe.ai/api/v1/lead/data/update', {
      method: 'POST', headers: { 'x-api-key': PLUSVIBE_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: PLUSVIBE_WORKSPACE, campaign_id: campaignId, email, variables: { label: 'MEETING_BOOKED' } }),
    })
    await fetch('https://api.plusvibe.ai/api/v1/lead/update/status', {
      method: 'POST', headers: { 'x-api-key': PLUSVIBE_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: PLUSVIBE_WORKSPACE, campaign_id: campaignId, email, new_status: 'COMPLETED' }),
    })
  } catch (err) {
    console.error('[webhook-meeting] PlusVibe lead update failed (non-critical):', (err as Error).message)
  }
}

async function updatePlusVibeByDomain(supabase: any, email: string) {
  try {
    const domain = email.split('@')[1]
    if (!domain) return
    // Zoek contacts met zelfde domein via leads (plusvibe campaign info)
    const { data: domainContacts } = await supabase
      .from('contacts')
      .select('email, leads(plusvibe_lead_id, campaign:campaigns(provider_campaign_id))')
      .like('email', `%@${domain}`)
      .not('email', 'is', null)
      .limit(50)
    for (const dc of (domainContacts || [])) {
      if (dc.email === email) continue
      const cc = (dc as any).leads?.[0]
      if (!cc?.plusvibe_lead_id || !cc?.campaign?.provider_campaign_id) continue
      fetch('https://api.plusvibe.ai/api/v1/lead/update/status', {
        method: 'POST', headers: { 'x-api-key': PLUSVIBE_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: PLUSVIBE_WORKSPACE, campaign_id: cc.campaign.provider_campaign_id, email: dc.email, new_status: 'COMPLETED' }),
      }).catch((err: Error) => console.error('[webhook-meeting] PlusVibe domain sync failed:', err.message))
    }
  } catch (err) {
    console.error('[webhook-meeting] updatePlusVibeByDomain failed:', (err as Error).message)
  }
}

// ============================================================
// HELPERS
// ============================================================
function fmtDt(s: string): string {
  if (!s) return 'unknown'
  try { return new Date(s).toLocaleString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' }) }
  catch { return s }
}

function extractDomainName(email: string): string {
  if (!email?.includes('@')) return ''
  return email.split('@')[1].split('.')[0]
}

async function sendSlackAlert(supabase: any, client: any, text: string) {
  const token = Deno.env.get('SLACK_BOT_TOKEN')

  // Fallback to webhook URL if bot token not configured yet
  if (!token) {
    const webhookUrl = Deno.env.get('SLACK_WEBHOOK_URL')
    if (!webhookUrl) {
      console.error('[webhook-meeting] No Slack token or webhook URL configured, dropping alert:', text.slice(0, 100))
      return
    }
    try { await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: '#sales-alerts', text }) }) }
    catch (_) { /* skip */ }
    return
  }

  // TEST_CHANNEL overrides everything — when set, only send there
  const testChannel = Deno.env.get('SLACK_TEST_CHANNEL')
  const channels = testChannel
    ? [testChannel]
    : [client?.slack_channel_id, '#sales-alerts'].filter(Boolean) as string[]

  for (const channel of channels) {
    try {
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, text, unfurl_links: false, unfurl_media: false }),
      })
    } catch (_) { /* skip */ }
  }
}
