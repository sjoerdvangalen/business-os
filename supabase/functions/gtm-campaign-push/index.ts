import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const EMAIL_BISON_API_KEY = Deno.env.get('EMAIL_BISON_API_KEY') ?? ''
const EB_BASE_URL = 'https://mail.scaleyourleads.com/api/campaigns'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

interface SequenceStep {
  order: number
  email_subject: string
  email_body: string
  wait_in_days: number
  variant: boolean
  thread_reply: boolean
}

interface HookFramework {
  pattern: string
  examples: string[]
  bullets?: string[]
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

const RAILWAY_BATCH_WORKER_URL = Deno.env.get('RAILWAY_BATCH_WORKER_URL') ?? ''

async function callRailway(
  endpoint: string,
  payload: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  if (!RAILWAY_BATCH_WORKER_URL) {
    return { success: false, error: 'RAILWAY_BATCH_WORKER_URL not configured' }
  }
  try {
    const response = await fetch(`${RAILWAY_BATCH_WORKER_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json()
    if (!response.ok) {
      return { success: false, error: `Railway ${endpoint} ${response.status}: ${JSON.stringify(data)}` }
    }
    return { success: true, data }
  } catch (error) {
    return { success: false, error: `Railway ${endpoint} invoke failed: ${(error as Error).message}` }
  }
}

async function invokeFunction(
  functionName: string,
  payload: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json()

    if (!response.ok) {
      return { success: false, error: `${functionName} returned ${response.status}: ${JSON.stringify(data)}` }
    }

    return { success: true, data }
  } catch (error) {
    return { success: false, error: `${functionName} invoke failed: ${(error as Error).message}` }
  }
}

function getCtaText(ctaVariant: string): string {
  switch (ctaVariant) {
    case 'info_send':
      return 'Can I send you more info?'
    case 'case_study_send':
      return 'Can I send you a relevant case study?'
    case 'direct_meeting':
      return 'Are you open to a brief call next week?'
    case 'diagnostic_offer':
      return 'Worth a quick diagnostic?'
    case 'soft_confirm':
      return 'Worth a conversation?'
    default:
      return 'Let me know if this is relevant.'
  }
}

function generateSequenceSteps(framework: HookFramework, ctaVariant: string): SequenceStep[] {
  const bullets = framework.bullets || []
  const subject = framework.pattern || 'quick question'

  const greeting = '{Hi|Hallo|Goedendag} {FIRST_NAME},'
  const signature = 'Met vriendelijke groet,\n{SENDER_FULL_NAME}'
  const ctaText = getCtaText(ctaVariant)

  const body1 = [
    greeting,
    '',
    ...bullets.slice(0, 3),
    '',
    ctaText,
    '',
    signature,
  ].join('\n')

  const body2 = bullets.length >= 1
    ? [
        greeting,
        '',
        `Quick follow-up — ${bullets[0].toLowerCase().replace(/\.$/, '')}.`,
        '',
        ctaText,
        '',
        signature,
      ].join('\n')
    : [
        greeting,
        '',
        'Just following up on my previous note.',
        '',
        ctaText,
        '',
        signature,
      ].join('\n')

  const body3 = [
    greeting,
    '',
    "I don't want to keep bothering you. If this isn't relevant, just let me know and I'll stop reaching out.",
    '',
    signature,
  ].join('\n')

  return [
    { order: 1, email_subject: subject, email_body: body1, wait_in_days: 1, variant: false, thread_reply: false },
    { order: 2, email_subject: `Re: ${subject}`, email_body: body2, wait_in_days: 3, variant: false, thread_reply: true },
    { order: 3, email_subject: `Re: ${subject}`, email_body: body3, wait_in_days: 5, variant: false, thread_reply: true },
  ]
}

async function uploadSequence(
  ebCampaignId: number,
  campaignName: string,
  steps: SequenceStep[]
): Promise<{ success: boolean; sequence_id?: number; error?: string }> {
  try {
    const payload = {
      title: campaignName,
      sequence_steps: steps.map((s) => ({
        email_subject: s.email_subject,
        order: s.order,
        email_body: s.email_body,
        wait_in_days: s.wait_in_days,
        variant: false,
        thread_reply: s.thread_reply,
      })),
    }

    const res = await fetch(
      `https://mail.scaleyourleads.com/api/campaigns/v1.1/${ebCampaignId}/sequence-steps`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${EMAIL_BISON_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    )

    if (!res.ok) {
      const errText = await res.text()
      return { success: false, error: errText }
    }

    const data = await res.json()
    return { success: true, sequence_id: data.data?.id }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

  try {
    const { client_id, cell_id, mode = 'immediate' } = await req.json() as {
      client_id?: string
      cell_id?: string
      mode?: 'review' | 'immediate'
    }

    if (!client_id && !cell_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing client_id or cell_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!EMAIL_BISON_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'EMAIL_BISON_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── CELL-SCOPED PUSH ───────────────────────────────────────────────────
    if (cell_id) {
      const { data: cell, error: cellError } = await supabase
        .from('campaign_cells')
        .select(`
          id,
          client_id,
          cell_code,
          solution_name,
          vertical_key,
          persona_key,
          status,
          cta_variant,
          brief
        `)
        .eq('id', cell_id)
        .single()

      if (cellError || !cell) {
        return new Response(
          JSON.stringify({ success: false, error: `Cell not found: ${cellError?.message}` }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id, name, client_code')
        .eq('id', cell.client_id)
        .single()

      if (clientError || !client) {
        return new Response(
          JSON.stringify({ success: false, error: `Client not found: ${clientError?.message}` }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (mode === 'immediate' && cell.status !== 'ready') {
        return new Response(
          JSON.stringify({ success: false, error: `Cell status is '${cell.status}' (need 'ready' for immediate push)` }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const brief = (cell.brief as Record<string, unknown>) ?? {}
      const hookFrameworks = brief.hook_frameworks as Record<string, HookFramework> | undefined
      const primaryFramework = hookFrameworks?.ERIC ?? hookFrameworks?.HUIDIG

      if (!primaryFramework) {
        return new Response(
          JSON.stringify({ success: false, error: 'No hook_frameworks found in cell brief — run gtm-campaign-cell-enrich first' }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const ctaVariant = (cell.cta_variant as string) || (brief.cta_directions as Record<string, unknown>)?.locked?.[0] || 'info_send'
      const sequenceSteps = generateSequenceSteps(primaryFramework, ctaVariant)

      if (mode === 'review') {
        return new Response(
          JSON.stringify({
            success: true,
            mode: 'review',
            cell_id,
            cell_code: cell.cell_code,
            cta_variant: ctaVariant,
            sequence_steps: sequenceSteps.map((s) => ({
              order: s.order,
              subject: s.email_subject,
              wait_in_days: s.wait_in_days,
              body_preview: s.email_body.substring(0, 120) + (s.email_body.length > 120 ? '...' : ''),
            })),
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Fetch warmed inboxes
      const { data: inboxes, error: inboxError } = await supabase
        .from('email_inboxes')
        .select('id, email, provider_inbox_id, overall_warmup_health, warmup_status')
        .eq('client_id', client.id)
        .not('provider_inbox_id', 'is', null)

      if (inboxError) {
        throw new Error(`Failed to fetch inboxes: ${inboxError.message}`)
      }

      const warmedInboxes = (inboxes || []).filter(
        (inbox) => (inbox.overall_warmup_health || 0) >= 80 || inbox.warmup_status === 'completed'
      )

      if (warmedInboxes.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'No warmed inboxes available for this client' }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const campaignName = `${client.client_code} | ${cell.cell_code} | ${cell.solution_name || cell.vertical_key || 'Campaign'}`
      const warnings: string[] = []

      // Step 1: Create EB campaign
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

      const ebCampaignIdRaw = ebResult.data?.id ?? ebResult.id
      const ebCampaignId = typeof ebCampaignIdRaw === 'string' ? parseInt(ebCampaignIdRaw) : Number(ebCampaignIdRaw)
      if (!ebCampaignId || isNaN(ebCampaignId)) {
        throw new Error('EmailBison returned no campaign ID')
      }

      console.log(`[${requestId}] EmailBison campaign created: ${ebCampaignId}`)

      // Step 2: Patch settings
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

      // Step 4: Upload sequence steps
      const seqResult = await uploadSequence(ebCampaignId, campaignName, sequenceSteps)
      if (!seqResult.success) {
        warnings.push(`Sequence upload failed: ${seqResult.error}`)
      } else {
        console.log(`[${requestId}] Sequence uploaded: ${sequenceSteps.length} steps`)
      }

      // Step 5: Attach inboxes
      const senderEmailIds = warmedInboxes
        .filter((i) => i.provider_inbox_id)
        .map((i) => parseInt(i.provider_inbox_id!))

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

      console.log(`[${requestId}] Attached ${senderEmailIds.length} inboxes`)

      // Step 6: Store campaign in DB
      const { data: newCampaign, error: campaignInsertError } = await supabase
        .from('campaigns')
        .insert({
          client_id: client.id,
          name: campaignName,
          status: 'active',
          language: 'nl',
          provider: 'emailbison',
          provider_campaign_id: String(ebCampaignId),
          cell_id: cell.id,
        })
        .select('id')
        .single()

      if (campaignInsertError || !newCampaign) {
        throw new Error(`Campaign DB insert failed: ${campaignInsertError?.message}`)
      }

      const campaignId = newCampaign.id

      // Step 7: Push leads via Railway batch-worker
      const pushResult = await callRailway('/push', {
        client_id: client.id,
        emailbison_campaign_id: ebCampaignId,
        campaign_id: campaignId,
        cell_id: cell.id,
        dry_run: false,
      })

      if (!pushResult.success) {
        warnings.push(`Lead push failed: ${pushResult.error}`)
      } else {
        const pushData = pushResult.data as Record<string, number> | undefined
        console.log(`[${requestId}] Leads pushed: ${pushData?.pushed || 0}`)
      }

      // Step 8: Update cell status to H1_testing
      await supabase
        .from('campaign_cells')
        .update({ status: 'H1_testing', updated_at: new Date().toISOString() })
        .eq('id', cell.id)

      return new Response(
        JSON.stringify({
          success: true,
          cell_id,
          campaign_id: campaignId,
          emailbison_campaign_id: ebCampaignId,
          sequence_uploaded: seqResult.success,
          leads_pushed: (pushResult.data as Record<string, number> | undefined)?.pushed || 0,
          inboxes_attached: senderEmailIds.length,
          warnings: warnings.length > 0 ? warnings : undefined,
          request_id: requestId,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── LEGACY CLIENT-ONLY PUSH ────────────────────────────────────────────
    if (!client_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'client_id required for legacy push' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    if (client.status === 'running') {
      console.log(`[${requestId}] Client ${client_id} already running — skipping campaign push`)
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'already running', client_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const wm = (client.workflow_metrics as Record<string, unknown>) ?? {}
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

    const { data: inboxes, error: inboxError } = await supabase
      .from('email_inboxes')
      .select('id, email, provider_inbox_id, overall_warmup_health, warmup_status')
      .eq('client_id', client_id)
      .not('provider_inbox_id', 'is', null)

    if (inboxError) {
      throw new Error(`Failed to fetch inboxes: ${inboxError.message}`)
    }

    const warmedInboxes = (inboxes || []).filter(
      (inbox) => (inbox.overall_warmup_health || 0) >= 80 || inbox.warmup_status === 'completed'
    )

    if (warmedInboxes.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No warmed inboxes available for this client' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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

    const ebCampaignIdRaw = ebResult.data?.id ?? ebResult.id
    const ebCampaignId = typeof ebCampaignIdRaw === 'string' ? parseInt(ebCampaignIdRaw) : Number(ebCampaignIdRaw)
    if (!ebCampaignId || isNaN(ebCampaignId)) throw new Error('EmailBison returned no campaign ID')

    console.log(`[${requestId}] EmailBison campaign created: ${ebCampaignId}`)

    const warnings: string[] = []

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

    const senderEmailIds = warmedInboxes
      .filter((i) => i.provider_inbox_id)
      .map((i) => parseInt(i.provider_inbox_id!))

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
    for (const contact of contacts ?? []) {
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

    await supabase
      .from('clients')
      .update({ status: 'running', stage: 'h1' })
      .eq('id', client_id)

    console.log(`[${requestId}] Legacy campaign push complete: eb_campaign=${ebCampaignId} db_campaign=${campaignId} leads=${leadsAdded}`)

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
