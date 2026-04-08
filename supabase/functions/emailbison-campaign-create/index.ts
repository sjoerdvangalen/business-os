import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Email Bison Campaign Creator
 *
 * Creates Email Bison campaigns with standard business-os settings
 * and attaches warmed inboxes automatically.
 *
 * Settings (business_os_default template):
 * - Max emails/day: 10000
 * - Schedule: 08:00-17:00, Mon-Fri, Europe/Amsterdam
 * - Track opens: disabled
 * - Plain text: enabled
 * - Unsubscribe link: disabled
 * - Prioritize followups: enabled
 */

interface CampaignRequest {
  client_code: string
  campaign_name: string
  template?: string
  sequence_id?: string
  /** Pass sequence steps directly - no built-in templates */
  sequence_steps?: SequenceStep[]
  mode?: 'review' | 'immediate'
  min_warmup_score?: number
  cell_id?: string
}

/** Sequence step for Email Bison */
interface SequenceStep {
  order: number
  email_subject: string
  email_body: string
  wait_in_days: number
  variant: boolean
  thread_reply: boolean
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startedAt = new Date()
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const body: CampaignRequest = await req.json()
    const {
      client_code,
      campaign_name,
      template = 'business_os_default',
      sequence_id,
      sequence_steps,
      mode = 'review',
      min_warmup_score = 80,
      cell_id,
    } = body

    // Validate required fields
    if (!client_code || !campaign_name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: client_code, campaign_name' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Get client
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, client_code, name')
      .eq('client_code', client_code.toUpperCase())
      .single()

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: `Client not found: ${client_code}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    // Get warmed inboxes for this client
    // Filter by provider_inbox_id not null (linked to EmailBison)
    // Note: using overall_warmup_health as proxy for warmup score (0-100)
    const { data: inboxes, error: inboxError } = await supabase
      .from('email_inboxes')
      .select('id, email, provider_inbox_id, overall_warmup_health, warmup_status, status')
      .eq('client_id', client.id)
      .not('provider_inbox_id', 'is', null)

    if (inboxError) {
      throw new Error(`Failed to fetch inboxes: ${inboxError.message}`)
    }

    // Filter by warmup health score
    const warmedInboxes = (inboxes || []).filter(inbox =>
      (inbox.overall_warmup_health || 0) >= min_warmup_score ||
      inbox.warmup_status === 'completed'
    )

    // Build preview
    const preview = {
      client_code,
      client_name: client.name,
      campaign_name,
      template,
      settings: {
        ...DEFAULT_SETTINGS,
        sequence_id: sequence_id || null,
      },
      inboxes: warmedInboxes.map(inbox => ({
        email: inbox.email,
        emailbison_id: inbox.provider_inbox_id,
        warmup_score: inbox.overall_warmup_health || 0,
        status: inbox.status,
      })),
      total_inboxes: warmedInboxes.length,
      can_create: warmedInboxes.length > 0,
      mode,
      sequence_steps: sequence_steps ? {
        count: sequence_steps.length,
        preview: sequence_steps.map(s => ({
          order: s.order,
          subject: s.email_subject.substring(0, 50) + (s.email_subject.length > 50 ? '...' : ''),
          wait_in_days: s.wait_in_days,
        })),
      } : null,
    }

    // If review mode, return preview only
    if (mode === 'review') {
      return new Response(
        JSON.stringify({
          success: true,
          mode: 'review',
          preview,
          message: 'Review preview generated. Call with mode="immediate" to create.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Immediate mode: create campaign
    if (warmedInboxes.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No warmed inboxes found for this client',
          preview,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const apiKey = Deno.env.get('EMAIL_BISON_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing EMAIL_BISON_API_KEY' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Create campaign in Email Bison
    // Step 1: Create campaign with basic settings
    const ebPayload = {
      name: campaign_name,
      max_emails_per_day: DEFAULT_SETTINGS.max_emails_per_day,
      max_new_leads_per_day: DEFAULT_SETTINGS.max_new_sequence_starts,
      plain_text: DEFAULT_SETTINGS.send_as_plain_text,
      track_opens: DEFAULT_SETTINGS.track_opens,
      unsubscribe_link: DEFAULT_SETTINGS.unsubscribe_link,
      include_auto_replies_in_stats: DEFAULT_SETTINGS.include_auto_replies_in_stats,
      sequence_prioritization: DEFAULT_SETTINGS.prioritize_followups ? 'followups' : 'new_leads',
      ...(sequence_id && { sequence_id }),
    }

    const ebResponse = await fetch('https://mail.scaleyourleads.com/api/campaigns', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(ebPayload),
    })

    if (!ebResponse.ok) {
      const errorText = await ebResponse.text()
      throw new Error(`Email Bison API error: ${ebResponse.status} ${errorText}`)
    }

    const ebResult = await ebResponse.json()
    const ebCampaignId = ebResult.data?.id || ebResult.id
    const warnings: string[] = []

    // Step 2: Update campaign settings via PATCH /update
    // Note: POST /campaigns ignores most settings, PATCH /update applies them correctly
    const settingsPayload = {
      max_emails_per_day: DEFAULT_SETTINGS.max_emails_per_day,
      max_new_leads_per_day: DEFAULT_SETTINGS.max_new_sequence_starts,
      plain_text: DEFAULT_SETTINGS.send_as_plain_text,
      track_opens: DEFAULT_SETTINGS.track_opens,
      can_unsubscribe: DEFAULT_SETTINGS.unsubscribe_link,
      include_auto_replies_in_stats: DEFAULT_SETTINGS.include_auto_replies_in_stats,
      sequence_prioritization: DEFAULT_SETTINGS.prioritize_followups ? 'followups' : 'new_leads',
    }

    const settingsResponse = await fetch(
      `https://mail.scaleyourleads.com/api/campaigns/${ebCampaignId}/update`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settingsPayload),
      }
    )

    if (!settingsResponse.ok) {
      const errorText = await settingsResponse.text()
      warnings.push(`Failed to update settings: ${errorText}`)
    }

    // Step 4: Create schedule via separate endpoint
    const schedulePayload = {
      monday: DEFAULT_SETTINGS.send_days.includes('mon'),
      tuesday: DEFAULT_SETTINGS.send_days.includes('tue'),
      wednesday: DEFAULT_SETTINGS.send_days.includes('wed'),
      thursday: DEFAULT_SETTINGS.send_days.includes('thu'),
      friday: DEFAULT_SETTINGS.send_days.includes('fri'),
      saturday: DEFAULT_SETTINGS.send_days.includes('sat'),
      sunday: DEFAULT_SETTINGS.send_days.includes('sun'),
      start_time: DEFAULT_SETTINGS.send_start_time,
      end_time: DEFAULT_SETTINGS.send_end_time,
      timezone: DEFAULT_SETTINGS.timezone,
      save_as_template: false,
    }

    const scheduleResponse = await fetch(
      `https://mail.scaleyourleads.com/api/campaigns/${ebCampaignId}/schedule`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(schedulePayload),
      }
    )

    if (!scheduleResponse.ok) {
      const errorText = await scheduleResponse.text()
      warnings.push(`Failed to set schedule: ${errorText}`)
    }

    // Step 4: Create sequence if steps provided
    let sequenceResult: { success: boolean; title?: string; steps_count?: number; error?: string } = { success: false }

    if (sequence_steps && sequence_steps.length > 0) {
      try {
        const seqPayload = {
          title: campaign_name,
          sequence_steps: sequence_steps,
        }

        const seqResponse = await fetch(
          `https://mail.scaleyourleads.com/api/campaigns/${ebCampaignId}/sequence-steps`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(seqPayload),
          }
        )

        if (seqResponse.ok) {
          sequenceResult = {
            success: true,
            title: campaign_name,
            steps_count: sequence_steps.length,
          }
        } else {
          const errorText = await seqResponse.text()
          sequenceResult = { success: false, error: errorText }
          warnings.push(`Failed to create sequence: ${errorText}`)
        }
      } catch (e) {
        const errorMsg = (e as Error).message
        sequenceResult = { success: false, error: errorMsg }
        warnings.push(`Error creating sequence: ${errorMsg}`)
      }
    }

    // Step 5: Attach sender emails to campaign using the correct endpoint
    // POST /api/campaigns/{id}/attach-sender-emails
    const senderEmailsToAttach = warmedInboxes
      .filter(inbox => inbox.provider_inbox_id)
      .map(inbox => parseInt(inbox.provider_inbox_id!))

    const attachedAccounts: string[] = []

    if (senderEmailsToAttach.length > 0) {
      try {
        const attachResponse = await fetch(
          `https://mail.scaleyourleads.com/api/campaigns/${ebCampaignId}/attach-sender-emails`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sender_email_ids: senderEmailsToAttach }),
          }
        )

        if (attachResponse.ok) {
          attachedAccounts.push(...warmedInboxes
            .filter(inbox => inbox.provider_inbox_id)
            .map(inbox => inbox.email)
          )
        } else {
          warnings.push(`Failed to attach accounts: ${await attachResponse.text()}`)
        }
      } catch (e) {
        warnings.push(`Error attaching accounts: ${(e as Error).message}`)
      }
    }

    // Store in business-os campaigns table
    const campaignData = {
      client_id: client.id,
      name: campaign_name,
      provider: 'emailbison',
      provider_campaign_id: String(ebCampaignId),
      status: 'active',
      health_status: 'UNKNOWN',
    }

    const { data: campaignRecord, error: campaignError } = await supabase
      .from('campaigns')
      .insert(campaignData)
      .select('id')
      .single()

    if (campaignError) {
      throw new Error(`Failed to store campaign: ${campaignError.message}`)
    }

    // Link to cell if specified
    if (cell_id) {
      await supabase
        .from('campaign_cells')
        .update({
          campaign_id: campaignRecord.id,
          cell_status: 'live',
          updated_at: new Date().toISOString(),
        })
        .eq('id', cell_id)
    }

    // Log to sync_log
    await supabase.from('sync_log').insert({
      source: 'emailbison',
      table_name: 'campaigns',
      operation: 'create',
      records_processed: 1,
      records_created: 1,
      started_at: startedAt.toISOString(),
      completed_at: new Date().toISOString(),
    })

    return new Response(
      JSON.stringify({
        success: true,
        emailbison_campaign_id: ebCampaignId,
        business_os_campaign_id: campaignRecord.id,
        attached_accounts: attachedAccounts,
        total_attached: attachedAccounts.length,
        sequence: sequenceResult.success ? {
          title: sequenceResult.title,
          steps_count: sequenceResult.steps_count,
        } : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    // Log error
    await supabase.from('sync_log').insert({
      source: 'emailbison',
      table_name: 'campaigns',
      operation: 'create',
      records_failed: 1,
      error_message: (error as Error).message,
      started_at: startedAt.toISOString(),
      completed_at: new Date().toISOString(),
    })

    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
