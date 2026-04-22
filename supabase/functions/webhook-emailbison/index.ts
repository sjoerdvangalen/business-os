import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Webhook EmailBison — processes real-time events from EmailBison
 * Includes DNC (Do Not Contact) entity management
 *
 * EmailBison webhook
 *   → Find client (campaign_name first 4 chars = client_code)
 *   → Find/create campaign
 *   → Find/create contact
 *   → Store email in email_threads
 *   → Manage DNC entities (bounces, replies, unsubscribes)
 *
 * Events: lead_replied, lead_interested, email_sent, email_opened, email_bounced, lead_unsubscribed
 *
 * EmailBison Payload Structure:
 * {
 *   event: { type: "LEAD_REPLIED", name: "Contact Replied", workspace_id: 1 },
 *   data: {
 *     scheduled_email: { id, lead_id, sequence_step_id, email_subject, email_body, status, sent_at },
 *     campaign_event: { id, type: "replied", created_at },
 *     lead: { id, uuid, email, first_name, last_name, title, company, emails_sent, opens, replies },
 *     campaign: { id, name },
 *     sender_email: { id, email, name }
 *   }
 * }
 */

// Clean HTML from email bodies
function cleanHtml(html: string): string {
  if (!html) return ''
  // Remove script and style tags
  let cleaned = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  // Replace common HTML tags with newlines
  cleaned = cleaned.replace(/<\/p>/gi, '\n')
  cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n')
  cleaned = cleaned.replace(/<[^>]+>/g, '')
  // Normalize whitespace
  cleaned = cleaned.replace(/&nbsp;/g, ' ')
  cleaned = cleaned.replace(/&amp;/g, '&')
  cleaned = cleaned.replace(/&lt;/g, '<')
  cleaned = cleaned.replace(/&gt;/g, '>')
  cleaned = cleaned.replace(/&quot;/g, '"')
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
  return cleaned.trim()
}

// Extract domain from email address
function emailToDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() || ''
}

/**
 * Add entity to DNC (Do Not Contact) list
 */
async function addDncEntity(
  supabase: ReturnType<typeof createClient>,
  opts: {
    clientId: string | null
    entityType: 'email' | 'domain' | 'contact_id'
    entityValue: string
    reason: string
    source: string
    sourceCampaignId?: string | null
    sourceContactId?: string | null
    expiresAt?: string | null
    bounceDetails?: Record<string, unknown> | null
    requestId: string
  }
): Promise<void> {
  const { clientId, entityType, entityValue, reason, source, sourceCampaignId, sourceContactId, expiresAt, bounceDetails, requestId } = opts

  if (!entityValue) {
    console.log(`[${requestId}] Skipping DNC: empty entity_value`)
    return
  }

  try {
    const { error } = await supabase
      .from('dnc_entities')
      .upsert({
        client_id: clientId, // NULL = global
        entity_type: entityType,
        entity_value: entityValue.toLowerCase().trim(),
        reason,
        source,
        source_campaign_id: sourceCampaignId || null,
        source_contact_id: sourceContactId || null,
        expires_at: expiresAt,
        bounce_details: bounceDetails,
      }, {
        onConflict: 'client_id,entity_type,entity_value',
        ignoreDuplicates: false // Update if exists
      })

    if (error) {
      console.error(`[${requestId}] DNC insert failed:`, error.message)
    } else {
      const scope = clientId ? `client:${clientId.slice(0, 8)}` : 'global'
      console.log(`[${requestId}] DNC added: ${entityType}=${entityValue} (${reason}, ${scope})`)
    }
  } catch (e) {
    console.error(`[${requestId}] DNC error:`, (e as Error).message)
  }
}

/**
 * Send Slack alert for critical inbox/warmup events
 */
async function appendContactHistory(
  supabase: ReturnType<typeof createClient>,
  contactId: string,
  entry: Record<string, unknown>
): Promise<void> {
  try {
    const { data: contact } = await supabase
      .from('contacts')
      .select('history')
      .eq('id', contactId)
      .single()
    const history = Array.isArray(contact?.history) ? contact.history as unknown[] : []
    history.push({ at: new Date().toISOString(), ...entry })
    await supabase.from('contacts').update({ history }).eq('id', contactId)
  } catch (e) {
    console.error(`[history] Failed to append for ${contactId}:`, (e as Error).message)
  }
}

async function sendSlackAlert(
  payload: Record<string, unknown>,
  requestId: string
): Promise<void> {
  const webhookUrl = Deno.env.get('SLACK_WEBHOOK_URL')
  if (!webhookUrl) {
    console.log(`[${requestId}] SLACK_WEBHOOK_URL not set, skipping alert`)
    return
  }
  try {
    const text = Object.entries(payload)
      .map(([k, v]) => `*${k}*: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join('\n')
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `[EmailBison Alert]\n${text}` }),
    })
  } catch (e) {
    console.error(`[${requestId}] Slack alert failed:`, (e as Error).message)
  }
}

/**
 * Find or create a contact
 * Lookup order: email → source_id (emailbison_lead_id) → create new
 */
async function findOrCreateContact(
  supabase: ReturnType<typeof createClient>,
  opts: {
    leadEmail: string
    emailbisonLeadId: string
    firstName: string
    lastName: string
    companyName: string
    title: string
    clientId: string | null
    campaignId: string | null
    requestId: string
  }
): Promise<{ id: string; company_id: string | null; reply_count: number; contact_status: string } | null> {
  const { leadEmail, emailbisonLeadId, firstName, lastName, companyName, title, clientId, campaignId, requestId } = opts

  if (!leadEmail) return null

  // 1. Find by email
  try {
    const { data } = await supabase
      .from('contacts')
      .select('id, company_id, reply_count, contact_status')
      .eq('email', leadEmail)
      .limit(1)
      .single()
    if (data) {
      console.log(`[${requestId}] Contact found by email: ${data.id}`)
      return data
    }
  } catch { /* not found */ }

  // 2. Find by source_id (emailbison_lead_id)
  if (emailbisonLeadId) {
    try {
      const { data } = await supabase
        .from('contacts')
        .select('id, company_id, reply_count, contact_status')
        .eq('source', 'emailbison')
        .eq('source_id', emailbisonLeadId)
        .limit(1)
        .single()
      if (data) {
        console.log(`[${requestId}] Contact found by emailbison source_id: ${data.id}`)
        return data
      }
    } catch { /* not found */ }
  }

  // 3. Not found → find/create company first
  console.log(`[${requestId}] Contact not found, creating new. Email: ${leadEmail}`)

  const domain = emailToDomain(leadEmail)
  let companyId: string | null = null

  if (domain) {
    try {
      const { data: byDomain } = await supabase
        .from('companies')
        .select('id')
        .eq('domain', domain)
        .limit(1)
        .single()
      companyId = byDomain?.id || null
    } catch { /* not found */ }
  }
  if (!companyId && companyName) {
    try {
      const { data: byName } = await supabase
        .from('companies')
        .select('id')
        .ilike('name', companyName)
        .limit(1)
        .single()
      companyId = byName?.id || null
    } catch { /* not found */ }
  }

  // Create company if still not found
  if (!companyId) {
    const { data: newCompany } = await supabase
      .from('companies')
      .insert({
        name: companyName || domain || 'Unknown',
        domain: domain || null,
        source: 'emailbison',
      })
      .select('id')
      .single()
    companyId = newCompany?.id || null
  }

  if (!companyId) {
    console.error(`[${requestId}] Failed to find/create company for ${leadEmail}`)
    return null
  }

  // Create contact
  const { data: newContact } = await supabase
    .from('contacts')
    .insert({
      company_id: companyId,
      client_id: clientId,
      last_campaign_id: campaignId || null,
      email: leadEmail,
      first_name: firstName || null,
      last_name: lastName || null,
      title: title || null,
      source: 'emailbison',
      source_id: emailbisonLeadId || null,
      contact_status: 'new',
      reply_count: 0,
    })
    .select('id')
    .single()

  if (!newContact) {
    console.error(`[${requestId}] Failed to create contact for ${leadEmail}`)
    return null
  }

  console.log(`[${requestId}] Contact created: ${newContact.id}, company: ${companyId}`)
  return { id: newContact.id, company_id: companyId, reply_count: 0, contact_status: 'new' }
}

serve(async (req) => {
  // Health check endpoint
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ status: 'ok', service: 'webhook-emailbison', timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Token authentication
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const expectedToken = Deno.env.get('WEBHOOK_EMAILBISON_TOKEN')

  if (!expectedToken) {
    return new Response(
      JSON.stringify({ error: 'Server misconfiguration: WEBHOOK_EMAILBISON_TOKEN not set' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }

  if (token !== expectedToken) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized: invalid token' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
    )
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let requestId = 'unknown'
  let payload: Record<string, unknown> = {}

  try {
    payload = await req.json()
    requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    console.log(`[${requestId}] EmailBison webhook received:`, JSON.stringify(payload).substring(0, 500))

    // EmailBison payload structure
    const eventType = (payload.event as Record<string, string>)?.type || ''
    const eventData = payload.data as Record<string, unknown> || {}

    const leadData = eventData.lead as Record<string, unknown> || {}
    const campaignData = eventData.campaign as Record<string, unknown> || {}
    const scheduledEmail = eventData.scheduled_email as Record<string, unknown> || {}
    const senderData = eventData.sender_email as Record<string, unknown> || {}
    const campaignEvent = eventData.campaign_event as Record<string, unknown> || {}

    // Extract fields
    const leadEmail = (leadData.email as string || '').toLowerCase().trim()
    const emailbisonLeadId = String(leadData.id || '')
    const firstName = (leadData.first_name as string) || ''
    const lastName = (leadData.last_name as string) || ''
    const title = (leadData.title as string) || ''
    const companyName = (leadData.company as string) || ''
    const campaignName = (campaignData.name as string) || ''
    const emailbisonCampId = String(campaignData.id || '')
    const emailbisonSenderId = String(senderData.id || '')
    const subject = (scheduledEmail.email_subject as string) || ''
    const body = (scheduledEmail.email_body as string) || ''
    const senderEmail = (senderData.email as string) || ''
    const eventSubType = (campaignEvent.type as string) || ''

    console.log(`[${requestId}] Event: ${eventType} | Lead: ${leadEmail} | Campaign: ${campaignName}`)

    // 0. Find Email Inbox (by EmailBison sender_email id)
    let emailInboxId: string | null = null
    if (emailbisonSenderId) {
      try {
        const { data: inbox } = await supabase
          .from('email_inboxes')
          .select('id')
          .eq('provider', 'emailbison')
          .eq('provider_inbox_id', emailbisonSenderId)
          .single()
        emailInboxId = inbox?.id || null
      } catch { /* not found */ }
    }

    // 1. Find Client (campaign_name first 4 chars = client_code)
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

    // 2. Find Campaign (by provider_campaign_id or name)
    let campaign: { id: string; client_id: string; name: string } | null = null

    if (emailbisonCampId) {
      try {
        const { data } = await supabase
          .from('campaigns')
          .select('id, client_id, name')
          .eq('provider', 'emailbison')
          .eq('provider_campaign_id', emailbisonCampId)
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

    // 3. Find or Create Contact (for ALL event types)
    const contact = await findOrCreateContact(supabase, {
      leadEmail,
      emailbisonLeadId,
      firstName,
      lastName,
      companyName,
      title,
      clientId,
      campaignId: campaign?.id || null,
      requestId,
    })

    // Handle event types
    switch (true) {

      // REPLIED / INTERESTED
      case eventType === 'LEAD_REPLIED' || eventType === 'LEAD_INTERESTED': {
        const cleanedBody = cleanHtml(body)
        const sentAt = (scheduledEmail.sent_at as string) || new Date().toISOString()

        // Calculate 90 days from now
        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + 90)

        // Update contact with reply info + response time
        if (contact) {
          const responseHours = sentAt
            ? Math.round((Date.now() - new Date(sentAt).getTime()) / (1000 * 60 * 60))
            : null

          await supabase.from('contacts').update({
            reply_count: (contact.reply_count || 0) + 1,
            last_reply_at: new Date().toISOString(),
            first_reply_at: (contact.reply_count || 0) === 0 ? new Date().toISOString() : undefined,
            contact_status: contact.contact_status === 'new' || contact.contact_status === 'targeted'
              ? 'responded'
              : contact.contact_status,
            ...(responseHours !== null ? { last_response_time_hours: responseHours } : {}),
          }).eq('id', contact.id)

          // Add to DNC (90 days, client-level)
          await addDncEntity(supabase, {
            clientId,
            entityType: 'contact_id',
            entityValue: contact.id,
            reason: 'replied',
            source: 'emailbison_webhook',
            sourceCampaignId: campaign?.id || null,
            sourceContactId: contact.id,
            expiresAt: expiresAt.toISOString(),
            requestId
          })

          await appendContactHistory(supabase, contact.id, {
            source: 'emailbison_webhook',
            changed_by: 'webhook-emailbison',
            fields: {
              reply_count: { from: contact.reply_count || 0, to: (contact.reply_count || 0) + 1 },
              contact_status: { from: contact.contact_status, to: contact.contact_status === 'new' || contact.contact_status === 'targeted' ? 'responded' : contact.contact_status },
            },
            note: `Lead ${eventType === 'LEAD_INTERESTED' ? 'interested' : 'replied'} via EmailBison`,
          })
        }

        // Store in email_threads
        const insertResult = await supabase.from('email_threads').insert({
          provider: 'emailbison',
          provider_lead_id: emailbisonLeadId,
          provider_campaign_id: emailbisonCampId,
          lead_id: contact?.id,
          campaign_id: campaign?.id,
          email_inbox_id: emailInboxId,
          direction: 'inbound',
          from_email: leadEmail,
          to_email: senderEmail,
          subject: subject,
          body_text: cleanedBody,
          sent_at: sentAt,
          replied_at: new Date().toISOString(),
        })

        if (insertResult.error) {
          console.error(`[${requestId}] email_threads REPLY insert failed:`, insertResult.error.message)
        } else {
          console.log(`[${requestId}] Reply stored for ${leadEmail}`)
        }

        break
      }

      // EMAIL SENT
      case eventType === 'EMAIL_SENT': {
        const sentAt = (scheduledEmail.sent_at as string) || new Date().toISOString()
        const cleanedBody = cleanHtml(body)

        const sentResult = await supabase.from('email_threads').insert({
          provider: 'emailbison',
          provider_lead_id: emailbisonLeadId,
          provider_campaign_id: emailbisonCampId,
          lead_id: contact?.id,
          campaign_id: campaign?.id,
          email_inbox_id: emailInboxId,
          direction: 'outbound',
          from_email: senderEmail,
          to_email: leadEmail,
          subject: subject,
          body_text: cleanedBody,
          sent_at: sentAt,
          replied_at: null,
          is_manual: false,
        })

        if (sentResult.error) {
          console.error(`[${requestId}] email_threads EMAIL_SENT insert failed:`, sentResult.error.message)
        } else {
          console.log(`[${requestId}] Email sent stored to ${leadEmail}`)
        }

        // Update contact status + email_activity JSONB
        if (contact) {
          // Detect FUP: check if prior outbound exists for this contact × campaign
          let isFollowup = false
          if (campaign?.id) {
            const { count } = await supabase
              .from('email_threads')
              .select('id', { count: 'exact', head: true })
              .eq('lead_id', contact.id)
              .eq('campaign_id', campaign.id)
              .eq('direction', 'outbound')
            isFollowup = (count ?? 0) > 1
          }

          // Read current email_activity
          const { data: currentContact } = await supabase
            .from('contacts').select('email_activity, contact_status, times_targeted').eq('id', contact.id).single()
          const activity = (currentContact?.email_activity as Record<string, unknown>) || {}
          const global = (activity.global as Record<string, unknown>) || {}
          const byClient = (activity.by_client as Record<string, unknown>) || {}
          const clientKey = clientId || 'unknown'
          const clientActivity = (byClient[clientKey] as Record<string, unknown>) || {}

          const updates: Record<string, unknown> = {
            email_activity: {
              global: {
                total_sent: ((global.total_sent as number) || 0) + 1,
                unique_outreaches: ((global.unique_outreaches as number) || 0) + (isFollowup ? 0 : 1),
                followups: ((global.followups as number) || 0) + (isFollowup ? 1 : 0),
                last_emailed_at: new Date().toISOString(),
                last_sender: senderEmail,
              },
              by_client: {
                ...byClient,
                [clientKey]: {
                  total_sent: ((clientActivity.total_sent as number) || 0) + 1,
                  unique_outreaches: ((clientActivity.unique_outreaches as number) || 0) + (isFollowup ? 0 : 1),
                  followups: ((clientActivity.followups as number) || 0) + (isFollowup ? 1 : 0),
                  last_emailed_at: new Date().toISOString(),
                  last_sender: senderEmail,
                },
              },
            },
          }

          if (currentContact?.contact_status === 'new') {
            updates.contact_status = 'targeted'
            updates.first_targeted_at = new Date().toISOString()
            updates.last_targeted_at = new Date().toISOString()
            updates.times_targeted = 1
          } else {
            updates.last_targeted_at = new Date().toISOString()
            updates.times_targeted = ((currentContact as Record<string, unknown>)?.times_targeted as number || 0) + 1
          }

          await supabase.from('contacts').update(updates).eq('id', contact.id)
        }

        break
      }

      // MANUAL EMAIL SENT — opslaan in email_threads met is_manual=true
      case eventType === 'MANUAL_EMAIL_SENT': {
        const sentAt = (scheduledEmail.sent_at as string) || new Date().toISOString()
        const cleanedBody = cleanHtml(body)

        const manualResult = await supabase.from('email_threads').insert({
          provider: 'emailbison',
          provider_lead_id: emailbisonLeadId,
          provider_campaign_id: emailbisonCampId,
          lead_id: contact?.id,
          campaign_id: campaign?.id,
          email_inbox_id: emailInboxId,
          direction: 'outbound',
          from_email: senderEmail,
          to_email: leadEmail,
          subject: subject,
          body_text: cleanedBody,
          sent_at: sentAt,
          replied_at: null,
          is_manual: true,
        })

        if (manualResult.error) {
          console.error(`[${requestId}] email_threads MANUAL_EMAIL_SENT insert failed:`, manualResult.error.message)
        } else {
          console.log(`[${requestId}] Manual email stored to ${leadEmail}`)
        }

        break
      }

      // EMAIL OPENED
      case eventType === 'EMAIL_OPENED': {
        console.log(`[${requestId}] Email opened: ${leadEmail}`)
        break
      }

      // BOUNCED — global DNC, permanent (geen hard/soft onderscheid via EmailBison)
      case eventType === 'EMAIL_BOUNCED': {
        console.log(`[${requestId}] Bounce: ${leadEmail}`)

        const bounceMessage = (eventData.bounce_message as string) || ''
        const smtpCode = (eventData.smtp_code as number) || 0

        await addDncEntity(supabase, {
          clientId: null,       // global — bounced email is dood voor alle clients
          entityType: 'email',
          entityValue: leadEmail,
          reason: 'bounce',
          source: 'emailbison_webhook',
          sourceCampaignId: campaign?.id || null,
          sourceContactId: contact?.id || null,
          expiresAt: null,      // permanent altijd
          bounceDetails: { message: bounceMessage, code: smtpCode },
          requestId
        })

        // Update contact status to bounced
        if (contact) {
          await supabase.from('contacts')
            .update({ contact_status: 'bounced' })
            .eq('id', contact.id)

          await appendContactHistory(supabase, contact.id, {
            source: 'emailbison_webhook',
            changed_by: 'webhook-emailbison',
            fields: {
              contact_status: { from: contact.contact_status, to: 'bounced' }
            },
            note: `Bounce: ${bounceMessage || 'SMTP ' + smtpCode}`,
          })
        }

        break
      }

      // UNSUBSCRIBED
      case eventType === 'LEAD_UNSUBSCRIBED': {
        console.log(`[${requestId}] Unsubscribed: ${leadEmail}`)

        // Update contact status
        if (contact) {
          await supabase.from('contacts').update({
            contact_status: 'unsubscribed',
          }).eq('id', contact.id)
        }

        // Add to DNC (permanent)
        await addDncEntity(supabase, {
          clientId,
          entityType: 'email',
          entityValue: leadEmail,
          reason: 'unsubscribe',
          source: 'emailbison_webhook',
          sourceCampaignId: campaign?.id || null,
          sourceContactId: contact?.id || null,
          // expiresAt: NULL (permanent)
          requestId
        })

        if (contact) {
          await appendContactHistory(supabase, contact.id, {
            source: 'emailbison_webhook',
            changed_by: 'webhook-emailbison',
            fields: {
              contact_status: { from: contact.contact_status, to: 'unsubscribed' }
            },
            note: 'Lead unsubscribed via EmailBison',
          })
        }

        break
      }

      // INBOX EVENTS — sync email_inboxes tabel
      case eventType === 'EMAIL_ACCOUNT_ADDED': {
        const senderEmail2 = (eventData.sender_email as Record<string, unknown>) || {}
        await supabase.from('email_inboxes').upsert({
          email: senderEmail2.email as string,
          provider_inbox_id: String(senderEmail2.id || ''),
          status: 'active',
          provider: 'emailbison',
        }, { onConflict: 'email' })
        console.log(`[${requestId}] Inbox added: ${senderEmail2.email}`)
        break
      }

      case eventType === 'EMAIL_ACCOUNT_REMOVED': {
        const senderEmail2 = (eventData.sender_email as Record<string, unknown>) || {}
        await supabase.from('email_inboxes')
          .update({ status: 'removed' })
          .eq('provider_inbox_id', String(senderEmail2.id || ''))
        console.log(`[${requestId}] Inbox removed: ${senderEmail2.id}`)
        break
      }

      case eventType === 'EMAIL_ACCOUNT_DISCONNECTED': {
        const senderEmail2 = (eventData.sender_email as Record<string, unknown>) || {}
        await supabase.from('email_inboxes')
          .update({ status: 'disconnected', health_status: 'CRITICAL' })
          .eq('provider_inbox_id', String(senderEmail2.id || ''))
        await sendSlackAlert({
          type: 'inbox_disconnected',
          email: senderEmail2.email,
          provider_inbox_id: senderEmail2.id,
        }, requestId)
        await supabase.from('alerts').insert({
          client_id: clientId || null,
          severity: 'critical',
          alert_type: 'inbox_disconnected',
          message: `Inbox ${senderEmail2.email} heeft de verbinding verbroken`,
          metadata: { provider_inbox_id: senderEmail2.id, email: senderEmail2.email },
        })
        console.log(`[${requestId}] Inbox disconnected: ${senderEmail2.email}`)
        break
      }

      case eventType === 'EMAIL_ACCOUNT_RECONNECTED': {
        const senderEmail2 = (eventData.sender_email as Record<string, unknown>) || {}
        await supabase.from('email_inboxes')
          .update({ status: 'active', health_status: 'HEALTHY' })
          .eq('provider_inbox_id', String(senderEmail2.id || ''))
        console.log(`[${requestId}] Inbox reconnected: ${senderEmail2.email}`)
        break
      }

      // WARMUP ALERTS
      case eventType === 'WARMUP_DISABLED_FOR_CAUSING_BOUNCES': {
        const senderEmail2 = (eventData.sender_email as Record<string, unknown>) || {}
        await supabase.from('email_inboxes')
          .update({ warmup_status: 'disabled', health_status: 'CRITICAL' })
          .eq('provider_inbox_id', String(senderEmail2.id || ''))
        await sendSlackAlert({
          type: 'warmup_causing_bounces',
          email: senderEmail2.email,
          action: 'Warmup disabled — inbox is causing bounces',
        }, requestId)
        await supabase.from('alerts').insert({
          client_id: clientId || null,
          severity: 'critical',
          alert_type: 'warmup_causing_bounces',
          message: `Warmup uitgeschakeld voor ${senderEmail2.email} — veroorzaakte te veel bounces`,
          metadata: { provider_inbox_id: senderEmail2.id, email: senderEmail2.email },
        })
        break
      }

      case eventType === 'WARMUP_DISABLED_FOR_RECEIVING_BOUNCES': {
        const senderEmail2 = (eventData.sender_email as Record<string, unknown>) || {}
        await supabase.from('email_inboxes')
          .update({ warmup_status: 'paused' })
          .eq('provider_inbox_id', String(senderEmail2.id || ''))
        await sendSlackAlert({
          type: 'warmup_receiving_bounces',
          email: senderEmail2.email,
          action: 'Warmup paused — inbox is receiving bounces',
        }, requestId)
        await supabase.from('alerts').insert({
          client_id: clientId || null,
          severity: 'warning',
          alert_type: 'warmup_receiving_bounces',
          message: `Warmup gepauzeerd voor ${senderEmail2.email} — ontving te veel bounces`,
          metadata: { provider_inbox_id: senderEmail2.id, email: senderEmail2.email },
        })
        break
      }

      // UNTRACKED REPLY — company/contact aanmaken + email_threads opslaan
      case eventType === 'UNTRACKED_REPLY_RECEIVED': {
        const fromEmail = ((eventData.from_email as string) || '').toLowerCase().trim()
        const fromName  = (eventData.from_name as string) || ''
        const replyBody = (eventData.body as string) || ''
        const domain    = fromEmail.split('@')[1]?.toLowerCase() || ''

        // Find or create contact (findOrCreateContact handles company find/create internally)
        const nameParts = fromName.trim().split(' ')
        const untrackedContact = await findOrCreateContact(supabase, {
          leadEmail: fromEmail,
          emailbisonLeadId: '',
          firstName: nameParts[0] || '',
          lastName: nameParts.slice(1).join(' ') || '',
          companyName: domain || '',
          title: '',
          clientId: null,
          campaignId: null,
          requestId,
        })

        // 3. Opslaan in email_threads
        if (untrackedContact) {
          await supabase.from('email_threads').insert({
            provider: 'emailbison',
            lead_id: untrackedContact.id,
            campaign_id: null,
            direction: 'inbound',
            from_email: fromEmail,
            to_email: null,
            subject: (eventData.subject as string) || '(untracked reply)',
            body_text: replyBody.substring(0, 2000),
            sent_at: new Date().toISOString(),
          })
        }

        // 4. Slack alert
        await sendSlackAlert({
          type: 'untracked_reply',
          from: fromEmail,
          name: fromName,
          company: domain,
          contact_aangemaakt: untrackedContact ? 'ja' : 'nee',
          preview: replyBody.substring(0, 200),
        }, requestId)

        console.log(`[${requestId}] Untracked reply: ${fromEmail} → contact ${untrackedContact?.id || 'failed'}`)
        break
      }

      // TAG EVENTS — alleen loggen
      case eventType === 'TAG_ATTACHED' || eventType === 'TAG_REMOVED': {
        console.log(`[${requestId}] Tag event: ${eventType}`, JSON.stringify(eventData).substring(0, 100))
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

    return new Response(
      JSON.stringify({ success: false, error: errorMessage, request_id: requestId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
