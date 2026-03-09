import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Webhook Receiver — processes real-time events from PlusVibe
 *
 * PlusVibe webhook
 *   → Find client (campaign_name first 4 chars = client_code)
 *   → Find/create campaign
 *   → Find/create contact (ALWAYS — for all event types)
 *   → Store email in email_threads
 *   → Call reply-classifier → lead-router (for replies)
 *
 * Events: ALL_EMAIL_REPLIES, EMAIL_SENT, BOUNCED_EMAIL, LEAD_MARKED_AS_*
 *
 * Field mapping based on official PlusVibe docs:
 * - REPLY: thread_id from PlusVibe, message_id = SMTP ID, last_email_id = PV ID
 * - EMAIL_SENT: no thread_id (generate), sent_email_id = PV ID, message_id = SMTP ID
 */

// Clean base64 images and normalize whitespace from email bodies
function cleanEmailBody(raw: string): string {
  if (!raw) return ''
  let cleaned = raw.replace(/data:image\/[^;]+;base64,[^\s"]+/g, '')
  cleaned = cleaned.replace(/\\n/g, '\n')
  cleaned = cleaned.replace(/\n{2,}/g, '\n')
  cleaned = cleaned.replace(/[ \t]+\n/g, '\n')
  return cleaned.trim()
}

// Extract domain from email address
function emailToDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() || ''
}

/**
 * Find or create a contact — used for ALL event types
 * Lookup order: email → plusvibe_lead_id → create new
 */
async function findOrCreateContact(
  supabase: ReturnType<typeof createClient>,
  opts: {
    leadEmail: string
    plusvibeLeadId: string
    firstName: string
    lastName: string
    companyName: string
    companyWebsite: string
    companyDomain: string
    personLinkedin: string
    companyLinkedin: string
    senderEmail: string
    ccEmail: string
    clientId: string | null
    campaignId: string | null
    plusvibeCampId: string
    requestId: string
  }
): Promise<{ id: string; account_id: string | null; replied_count: number; lead_status: string; is_first_reply: boolean | null } | null> {
  const { leadEmail, plusvibeLeadId, firstName, lastName, companyName, companyWebsite, companyDomain, personLinkedin, companyLinkedin, senderEmail, ccEmail, clientId, campaignId, plusvibeCampId, requestId } = opts

  if (!leadEmail) return null

  // 1. Find by email
  try {
    const { data } = await supabase
      .from('contacts')
      .select('id, account_id, replied_count, lead_status, is_first_reply')
      .eq('email', leadEmail)
      .limit(1)
      .single()
    if (data) {
      console.log(`[${requestId}] Contact found by email: ${data.id}`)
      return data
    }
  } catch { /* not found */ }

  // 2. Find by plusvibe_lead_id
  if (plusvibeLeadId) {
    try {
      const { data } = await supabase
        .from('contacts')
        .select('id, account_id, replied_count, lead_status, is_first_reply')
        .eq('plusvibe_lead_id', plusvibeLeadId)
        .limit(1)
        .single()
      if (data) {
        console.log(`[${requestId}] Contact found by plusvibe_lead_id: ${data.id}`)
        return data
      }
    } catch { /* not found */ }
  }

  // 3. Not found → create contact + account
  console.log(`[${requestId}] Contact not found, creating new. Email: ${leadEmail}`)

  // Find or create account
  let accountId: string | null = null
  const domain = companyDomain || emailToDomain(leadEmail)

  if (domain) {
    try {
      const { data: byDomain } = await supabase
        .from('accounts')
        .select('id')
        .eq('domain', domain)
        .limit(1)
        .single()
      accountId = byDomain?.id || null
    } catch { /* not found */ }
  }
  if (!accountId && companyName) {
    try {
      const { data: byName } = await supabase
        .from('accounts')
        .select('id')
        .ilike('name', companyName)
        .limit(1)
        .single()
      accountId = byName?.id || null
    } catch { /* not found */ }
  }

  // Create contact
  const { data: newContact } = await supabase.from('contacts').insert({
    client_id: clientId,
    account_id: accountId,
    campaign_id: campaignId,
    email: leadEmail,
    first_name: firstName,
    last_name: lastName,
    full_name: `${firstName} ${lastName}`.trim() || null,
    plusvibe_lead_id: plusvibeLeadId || null,
    plusvibe_campaign_id: plusvibeCampId || null,
    linkedin_url: personLinkedin || null,
    company: companyName || null,
    company_website: companyWebsite || null,
    sender_email: senderEmail || null,
    cc_email: ccEmail || null,
    lead_status: 'new',
    replied_count: 0,
  }).select('id').single()

  if (!newContact) {
    console.error(`[${requestId}] Failed to create contact for ${leadEmail}`)
    return null
  }

  // Create account if needed
  if (!accountId) {
    const { data: newAccount } = await supabase.from('accounts').insert({
      client_id: clientId,
      name: companyName || domain || 'Unknown',
      domain: domain || null,
      linkedin_url: companyLinkedin || null,
    }).select('id').single()

    if (newAccount) {
      await supabase.from('contacts').update({ account_id: newAccount.id }).eq('id', newContact.id)
      accountId = newAccount.id
    }
  }

  console.log(`[${requestId}] Contact created: ${newContact.id}, account: ${accountId}`)
  return { id: newContact.id, account_id: accountId, replied_count: 0, lead_status: 'new', is_first_reply: null }
}

serve(async (req) => {
  // ── Health check endpoint (for PlusVibe webhook verification) ──
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ status: 'ok', service: 'webhook-receiver', timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Declare outside try so catch block can access them
  let requestId = 'unknown'
  let payload: Record<string, unknown> = {}

  try {
    payload = await req.json()
    requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    console.log(`[${requestId}] Webhook received:`, JSON.stringify(payload).substring(0, 500))

    // ── Log webhook to database for debugging ──
    await supabase.from('webhook_logs').insert({
      source: 'plusvibe',
      event_type: payload.webhook_event || payload.event || 'unknown',
      payload: payload,
      status: 'received',
      request_id: requestId,
    }).then(({ error }) => {
      if (error) console.error(`[${requestId}] Failed to log webhook:`, error.message)
    })

    // ── Extract PlusVibe webhook fields ──
    const eventType = (payload.webhook_event || payload.event || payload.event_type || '') as string
    const leadEmail = ((payload.email || payload.lead_email || payload.to_email || '') as string).toLowerCase().trim()
    const firstName = (payload.first_name || '') as string
    const lastName = (payload.last_name || '') as string
    const companyName = (payload.company_name || '') as string
    const companyWebsite = (payload.company_website || '') as string
    const companyLinkedin = (payload.linkedin_company_url || '') as string
    const personLinkedin = (payload.linkedin_person_url || '') as string
    const campaignName = (payload.campaign_name || '') as string
    const plusvibeCampId = (payload.camp_id || payload.campaign_id || '') as string
    const plusvibeLeadId = (payload.lead_id || payload._id || '') as string
    const replyBody = (payload.text_body || payload.reply_body || payload.body || payload.email_body || '') as string
    const subject = (payload.subject || '') as string
    const senderEmail = (payload.email_account_name || payload.from_email || payload.from || '') as string
    const ccEmail = (payload.cc_email || '') as string
    const plusvibeEmailAccountId = (payload.email_account_id || '') as string
    const leadLabel = (payload.label || '') as string

    console.log(`[${requestId}] Event: ${eventType} | Lead: ${leadEmail} | Campaign: ${campaignName}`)

    // ── 0. Find Email Inbox (by PlusVibe email_account_id) ──
    let emailInboxId: string | null = null
    if (plusvibeEmailAccountId) {
      try {
        const { data: inbox } = await supabase
          .from('email_inboxes')
          .select('id')
          .eq('plusvibe_id', plusvibeEmailAccountId)
          .single()
        emailInboxId = inbox?.id || null
      } catch { /* not found */ }
    }

    // ── 1. Find Client (campaign_name first 4 chars = client_code) ──
    const clientCode = campaignName ? campaignName.slice(0, 4).trim().toUpperCase() : ''
    let clientId: string | null = null

    if (clientCode) {
      try {
        const { data: client } = await supabase
          .from('clients')
          .select('id')
          .eq('client_code', clientCode)
          .single()
        clientId = client?.id || null
      } catch { /* not found */ }
    }

    // ── 2. Find Campaign (by plusvibe_id or name) ──
    let campaign: { id: string; client_id: string; name: string } | null = null

    if (plusvibeCampId) {
      try {
        const { data } = await supabase
          .from('campaigns')
          .select('id, client_id, name')
          .eq('plusvibe_id', plusvibeCampId)
          .single()
        campaign = data
      } catch { /* not found */ }
    }
    if (!campaign && campaignName) {
      try {
        const { data } = await supabase
          .from('campaigns')
          .select('id, client_id, name')
          .eq('name', campaignName)
          .single()
        campaign = data
      } catch { /* not found */ }
    }

    // Use campaign's client_id if we didn't find one via client_code
    if (!clientId && campaign?.client_id) {
      clientId = campaign.client_id
    }

    // ── 3. Find or Create Contact (for ALL event types) ──
    const companyDomain = companyWebsite
      ? companyWebsite.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()
      : emailToDomain(leadEmail)

    const contact = await findOrCreateContact(supabase, {
      leadEmail,
      plusvibeLeadId,
      firstName,
      lastName,
      companyName,
      companyWebsite,
      companyDomain,
      personLinkedin,
      companyLinkedin,
      senderEmail,
      ccEmail,
      clientId,
      campaignId: campaign?.id || null,
      plusvibeCampId,
      requestId,
    })

    // ── Handle event types ──
    switch (true) {

      // ═══════════════════════════════════════════
      // REPLY — the core flow
      // ═══════════════════════════════════════════
      case eventType.includes('REPLY') || eventType === 'ALL_EMAIL_REPLIES': {
        const cleanedBody = cleanEmailBody(replyBody)

        // Update contact with reply info
        if (contact) {
          const isFirstReply = !contact.is_first_reply && (contact.replied_count || 0) === 0
          await supabase.from('contacts').update({
            replied_count: (contact.replied_count || 0) + 1,
            last_reply_at: new Date().toISOString(),
            email_history: cleanedBody,
            is_first_reply: isFirstReply ? true : contact.is_first_reply,
            sender_email: senderEmail || undefined,
            lead_status: contact.lead_status === 'new' ? 'replied' : contact.lead_status,
          }).eq('id', contact.id)
        }

        // ── Store in email_threads ──
        // PlusVibe REPLY fields:
        //   last_email_id = PlusVibe's unique message ID (use as plusvibe_id)
        //   message_id = SMTP Message-ID (use as plusvibe_message_id)
        //   thread_id = PlusVibe's thread grouping ID
        //   modified_at = reply timestamp
        //   from_email / email = lead's email
        //   to_email / email_account_name = our inbox
        const replyPlusvideId = (payload.last_email_id || `reply-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`) as string
        const replyMessageId = (payload.message_id || null) as string | null
        const replyThreadId = (payload.thread_id || `${leadEmail}::${plusvibeCampId}`) as string
        const replySentAt = (payload.modified_at || new Date().toISOString()) as string

        const insertResult = await supabase.from('email_threads').insert({
          plusvibe_id: replyPlusvideId,
          plusvibe_message_id: replyMessageId,
          thread_id: replyThreadId,
          last_email_id: (payload.last_email_id || replyPlusvideId) as string,
          contact_id: contact?.id,
          campaign_id: campaign?.id,
          email_inbox_id: emailInboxId,
          direction: 'inbound',
          from_email: ((payload.from_email || payload.email) as string || leadEmail),
          to_email: ((payload.to_email || payload.email_account_name) as string || senderEmail),
          subject: subject,
          body_text: cleanedBody,
          plusvibe_label: leadLabel || null,
          sent_at: replySentAt,
          replied_at: replySentAt,
        })

        if (insertResult.error) {
          console.error(`[${requestId}] email_threads REPLY insert failed:`, insertResult.error.message)
        } else {
          console.log(`[${requestId}] Reply stored: ${replyPlusvideId}`)
        }

        // ── Call reply-classifier → lead-router for Slack alerts ──
        if (contact) {
          try {
            const classifierUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/reply-classifier`
            await fetch(classifierUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                contact_id: contact.id,
                contact_email: leadEmail,
                campaign_id: campaign?.id,
                campaign_name: campaignName,
                client_id: clientId,
                plusvibe_camp_id: plusvibeCampId,
                reply_body: cleanedBody,
                subject: subject,
              }),
            })
            console.log(`[${requestId}] Reply-classifier called for ${leadEmail}`)
          } catch (classifierError) {
            console.error(`[${requestId}] Reply-classifier call failed:`, (classifierError as Error).message)
          }
        }

        console.log(`[${requestId}] Reply processed: ${leadEmail} | campaign: ${campaignName}`)
        break
      }

      // ═══════════════════════════════════════════
      // EMAIL SENT
      // ═══════════════════════════════════════════
      case eventType === 'EMAIL_SENT': {
        // PlusVibe EMAIL_SENT fields:
        //   sent_email_id = PlusVibe's unique sent ID (use as plusvibe_id)
        //   message_id = SMTP Message-ID (use as plusvibe_message_id)
        //   NO thread_id → generate as leadEmail::campId
        //   sent_on = send timestamp
        //   email_account_name = our inbox (sender/from)
        //   email / lead_email = lead's email (recipient/to)
        const sentPlusvideId = (payload.sent_email_id || `sent-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`) as string
        const sentMessageId = (payload.message_id || null) as string | null
        const sentThreadId = `${leadEmail}::${plusvibeCampId}`
        const sentAt = (payload.sent_on || new Date().toISOString()) as string

        const sentResult = await supabase.from('email_threads').insert({
          plusvibe_id: sentPlusvideId,
          plusvibe_message_id: sentMessageId,
          thread_id: sentThreadId,
          last_email_id: (payload.sent_email_id || null) as string | null,
          contact_id: contact?.id,
          campaign_id: campaign?.id,
          email_inbox_id: emailInboxId,
          direction: 'outbound',
          from_email: (payload.email_account_name as string) || senderEmail,
          to_email: ((payload.lead_email || payload.email) as string) || leadEmail,
          subject: subject,
          body_text: (payload.body || '') as string,
          plusvibe_label: null,
          sent_at: sentAt,
          replied_at: null,
        })

        if (sentResult.error) {
          console.error(`[${requestId}] email_threads EMAIL_SENT insert failed:`, sentResult.error.message)
        } else {
          console.log(`[${requestId}] Email sent stored: ${sentPlusvideId} to ${leadEmail}`)
        }

        // Update contact status to contacted if still new
        if (contact && contact.lead_status === 'new') {
          await supabase.from('contacts').update({ lead_status: 'contacted' }).eq('id', contact.id)
        }

        break
      }

      // ═══════════════════════════════════════════
      // BOUNCE — log but don't process
      // ═══════════════════════════════════════════
      case eventType === 'BOUNCED_EMAIL': {
        console.log(`[${requestId}] Bounce: ${leadEmail}`)
        break
      }

      // ═══════════════════════════════════════════
      // LEAD LABEL CHANGED
      // ═══════════════════════════════════════════
      case eventType.includes('LEAD_MARKED_AS'): {
        const label = eventType.replace('LEAD_MARKED_AS_', '')

        if (contact) {
          await supabase.from('contacts').update({
            label: label,
            lead_status: label.toLowerCase().includes('interested') ? 'interested'
              : label.toLowerCase().includes('meeting') ? 'meeting_booked'
              : contact.lead_status,
          }).eq('id', contact.id)
        }

        console.log(`[${requestId}] Label: ${leadEmail} → ${label}`)
        break
      }

      default:
        console.log(`[${requestId}] Unhandled event: ${eventType}`)
    }

    return new Response(
      JSON.stringify({ success: true, event: eventType, lead: leadEmail, request_id: requestId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const errorMessage = (error as Error).message
    console.error(`[${requestId}] Webhook error:`, errorMessage)

    // Log error to webhook_logs
    try {
      await supabase.from('webhook_logs').insert({
        source: 'plusvibe-error',
        event_type: 'EXCEPTION',
        payload: payload,
        status: 'error',
        error_message: errorMessage,
        request_id: requestId,
      })
    } catch { /* ignore logging failure */ }

    return new Response(
      JSON.stringify({ success: false, error: errorMessage, request_id: requestId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
