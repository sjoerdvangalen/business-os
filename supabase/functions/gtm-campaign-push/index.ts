import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const EMAIL_BISON_API_KEY = Deno.env.get('EMAIL_BISON_API_KEY') ?? ''
const EB_BASE_URL = 'https://mail.scaleyourleads.com/api/campaigns'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DEFAULT_SETTINGS = {
  max_emails_per_day: 10000,
  max_new_sequence_starts: 10000,
  timezone: 'Europe/Amsterdam',
  send_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  send_start_time: '08:00',
  send_end_time: '17:00',
  prioritize_followups: true,
  track_opens: false,
  send_as_plain_text: true,
  unsubscribe_link: false,
  include_auto_replies_in_stats: true,
}

async function ebRequest(
  method: string,
  url: string,
  body?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${EMAIL_BISON_API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`EmailBison ${method} ${url} error ${res.status}: ${err.substring(0, 200)}`)
  }

  return await res.json()
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
    const { client_id } = await req.json() as { client_id: string }

    if (!client_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing client_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!EMAIL_BISON_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'EMAIL_BISON_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: client, error: fetchError } = await supabase
      .from('clients')
      .select('id, name, status, workflow_metrics')
      .eq('id', client_id)
      .single()

    if (fetchError || !client) {
      return new Response(
        JSON.stringify({ success: false, error: `Client not found: ${fetchError?.message}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Idempotency guard — campaign push may be triggered multiple times
    if (client.status === 'running') {
      console.log(`[${requestId}] Client ${client_id} already running — skipping campaign push`)
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'already running', client_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const wm = (client.workflow_metrics as Record<string, unknown>) ?? {}

    // Validate preconditions using workflow_metrics
    const messagingStatus = ((wm.messaging_approval as Record<string, unknown>) ?? {}).status
    const sourcingStatus = ((wm.sourcing_review as Record<string, unknown>) ?? {}).status
    const infraStatus = ((wm.infra as Record<string, unknown>) ?? {}).status

    const errors: string[] = []
    if (messagingStatus !== 'approved') errors.push(`messaging_approval.status = '${messagingStatus}' (need approved)`)
    if (sourcingStatus !== 'approved') errors.push(`sourcing_review.status = '${sourcingStatus}' (need approved)`)
    if (infraStatus !== 'ready') errors.push(`infra.status = '${infraStatus}' (need ready)`)

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Preconditions not met', details: errors }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Read ready cells to inform campaign name and validate cells exist
    const { data: readyCells } = await supabase
      .from('campaign_cells')
      .select('cell_code')
      .eq('client_id', client_id)
      .eq('status', 'ready')

    if (!readyCells || readyCells.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No ready cells found — run gtm-campaign-cell-enrich first' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const campaignName = `${client.name} — GTM Pipeline — ${readyCells.length} cells [${new Date().toISOString().substring(0, 10)}]`

    // Fetch warmed inboxes for this client
    const { data: inboxes, error: inboxError } = await supabase
      .from('email_inboxes')
      .select('id, email, provider_inbox_id, overall_warmup_health, warmup_status')
      .eq('client_id', client_id)
      .not('provider_inbox_id', 'is', null)

    if (inboxError) {
      throw new Error(`Failed to fetch inboxes: ${inboxError.message}`)
    }

    const warmedInboxes = (inboxes || []).filter(inbox =>
      (inbox.overall_warmup_health || 0) >= 80 || inbox.warmup_status === 'completed'
    )

    if (warmedInboxes.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No warmed inboxes available for this client' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 1: Create EmailBison campaign
    const ebResult = await ebRequest('POST', EB_BASE_URL, {
      name: campaignName,
      max_emails_per_day: DEFAULT_SETTINGS.max_emails_per_day,
      max_new_leads_per_day: DEFAULT_SETTINGS.max_new_sequence_starts,
      plain_text: DEFAULT_SETTINGS.send_as_plain_text,
      track_opens: DEFAULT_SETTINGS.track_opens,
      unsubscribe_link: DEFAULT_SETTINGS.unsubscribe_link,
      include_auto_replies_in_stats: DEFAULT_SETTINGS.include_auto_replies_in_stats,
      sequence_prioritization: 'followups',
    })

    const ebCampaignId = ebResult.data?.id || ebResult.id
    if (!ebCampaignId) throw new Error('EmailBison returned no campaign ID')

    console.log(`[${requestId}] EmailBison campaign created: ${ebCampaignId}`)

    const warnings: string[] = []

    // Step 2: Apply settings via PATCH
    const settingsRes = await fetch(`${EB_BASE_URL}/${ebCampaignId}/update`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${EMAIL_BISON_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        max_emails_per_day: DEFAULT_SETTINGS.max_emails_per_day,
        max_new_leads_per_day: DEFAULT_SETTINGS.max_new_sequence_starts,
        plain_text: DEFAULT_SETTINGS.send_as_plain_text,
        track_opens: DEFAULT_SETTINGS.track_opens,
        can_unsubscribe: DEFAULT_SETTINGS.unsubscribe_link,
        include_auto_replies_in_stats: DEFAULT_SETTINGS.include_auto_replies_in_stats,
        sequence_prioritization: 'followups',
      }),
    })
    if (!settingsRes.ok) warnings.push(`Settings update failed: ${await settingsRes.text()}`)

    // Step 3: Set schedule
    const scheduleRes = await fetch(`${EB_BASE_URL}/${ebCampaignId}/schedule`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${EMAIL_BISON_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        monday: true, tuesday: true, wednesday: true, thursday: true, friday: true,
        saturday: false, sunday: false,
        start_time: DEFAULT_SETTINGS.send_start_time,
        end_time: DEFAULT_SETTINGS.send_end_time,
        timezone: DEFAULT_SETTINGS.timezone,
        save_as_template: false,
      }),
    })
    if (!scheduleRes.ok) warnings.push(`Schedule set failed: ${await scheduleRes.text()}`)

    // Step 4: Attach warmed inboxes — this activates the campaign
    const senderEmailIds = warmedInboxes
      .filter(i => i.provider_inbox_id)
      .map(i => parseInt(i.provider_inbox_id!))

    const attachRes = await fetch(`${EB_BASE_URL}/${ebCampaignId}/attach-sender-emails`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${EMAIL_BISON_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sender_email_ids: senderEmailIds }),
    })

    if (!attachRes.ok) {
      const errText = await attachRes.text()
      throw new Error(`Failed to attach inboxes to campaign: ${errText}`)
    }

    console.log(`[${requestId}] Attached ${senderEmailIds.length} inboxes to EB campaign ${ebCampaignId}`)

    // Store campaign in DB
    const { data: newCampaign, error: campaignInsertError } = await supabase
      .from('campaigns')
      .insert({
        client_id,
        name: campaignName,
        status: 'active',
        language: 'nl',
        provider: 'emailbison',
        provider_campaign_id: String(ebCampaignId),
      })
      .select('id')
      .single()

    if (campaignInsertError || !newCampaign) {
      throw new Error(`Campaign DB insert failed: ${campaignInsertError?.message}`)
    }

    const campaignId = newCampaign.id

    // Add sourced contacts as leads in local DB
    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('id, email, first_name, last_name, title')
      .eq('client_id', client_id)
      .eq('source', 'aleads')
      .not('email', 'is', null)
      .limit(500)

    if (contactsError) {
      console.error(`[${requestId}] Failed to fetch contacts:`, contactsError.message)
    }

    let leadsAdded = 0
    for (const contact of (contacts ?? [])) {
      const { error: leadError } = await supabase
        .from('leads')
        .insert({
          client_id,
          contact_id: contact.id,
          campaign_id: campaignId,
          status: 'pending',
        })
      if (!leadError) leadsAdded++
    }

    // Campaign is live — update client status + stage
    await supabase
      .from('clients')
      .update({ status: 'running', stage: 'h1' })
      .eq('id', client_id)

    console.log(`[${requestId}] Campaign push complete: eb_campaign=${ebCampaignId} db_campaign=${campaignId} leads=${leadsAdded} inboxes=${senderEmailIds.length}`)

    return new Response(
      JSON.stringify({
        success: true,
        client_id,
        campaign_id: campaignId,
        emailbison_campaign_id: ebCampaignId,
        inboxes_attached: senderEmailIds.length,
        leads_added: leadsAdded,
        warnings: warnings.length > 0 ? warnings : undefined,
        request_id: requestId,
      }),
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
