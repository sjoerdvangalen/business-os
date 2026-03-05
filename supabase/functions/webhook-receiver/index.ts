import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Webhook Receiver — processes real-time events from PlusVibe
 *
 * Replicates the n8n "2.0 | Reply PV -> Airtable" flow in Supabase:
 *
 * PlusVibe webhook
 *   → Find client (campaign_name first 4 chars = client_code)
 *   → Find/create campaign
 *   → Find contact (by email / lead_id)
 *     → EXISTS: update (email_history, reply count)
 *     → NOT EXISTS:
 *         → Find account (by company_name / domain)
 *           → EXISTS: create contact linked to account
 *           → NOT EXISTS: create contact + create account
 *   → Store email message in email_threads
 *   → Call reply-classifier → lead-router
 *
 * Events: ALL_EMAIL_REPLIES, BOUNCED_EMAIL, EMAIL_SENT, LEAD_MARKED_AS_*
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

serve(async (req) => {
  // ── Health check endpoint (for PlusVibe webhook verification) ──
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ 
        status: 'ok', 
        service: 'webhook-receiver',
        timestamp: new Date().toISOString()
      }),
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

  try {
    const payload = await req.json()
    const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    console.log(`[${requestId}] Webhook received:`, JSON.stringify(payload).substring(0, 500))

    // ── CRITICAL: Log EVERY webhook to database for debugging ──
    const { error: logError } = await supabase.from('webhook_logs').insert({
      source: 'plusvibe',
      event_type: payload.webhook_event || payload.event || 'unknown',
      payload: payload,
      status: 'received',
      request_id: requestId,
    })
    
    if (logError) {
      console.error(`[${requestId}] Failed to log webhook:`, logError.message)
    } else {
      console.log(`[${requestId}] Webhook logged to database`)
    }

    // ── Extract PlusVibe webhook fields ──
    const eventType = payload.webhook_event || payload.event || payload.event_type || ''
    const leadEmail = (payload.email || payload.lead_email || payload.to_email || '').toLowerCase().trim()
    const firstName = payload.first_name || ''
    const lastName = payload.last_name || ''
    const companyName = payload.company_name || ''
    const companyWebsite = payload.company_website || ''
    const companyLinkedin = payload.linkedin_company_url || ''
    const personLinkedin = payload.linkedin_person_url || ''
    const campaignName = payload.campaign_name || ''
    const plusvibeCampId = payload.camp_id || payload.campaign_id || ''
    const plusvibeLeadId = payload.lead_id || ''
    const replyBody = payload.text_body || payload.reply_body || payload.body || payload.email_body || ''
    const subject = payload.subject || ''
    const senderEmail = payload.email_account_name || payload.from_email || payload.from || ''
    const senderFirstName = payload.sender_first_name || ''
    const senderLastName = payload.sender_last_name || ''
    const ccEmail = payload.cc_email || ''
    const plusvibeEmailAccountId = payload.email_account_id || ''
    const leadLabel = payload.label || ''
    const plusvibeLastEmailId = payload.last_email_id || ''

    // ── 0. Find Email Inbox (by PlusVibe email_account_id) ──
    let emailInboxId: string | null = null
    if (plusvibeEmailAccountId) {
      const { data: inbox } = await supabase
        .from('email_inboxes')
        .select('id, email')
        .eq('plusvibe_id', plusvibeEmailAccountId)
        .single()
      emailInboxId = inbox?.id || null
    }

    // ── 1. Find Client (campaign_name first 4 chars = client_code) ──
    const clientCode = campaignName ? campaignName.slice(0, 4).trim().toUpperCase() : ''
    let clientId: string | null = null

    if (clientCode) {
      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('client_code', clientCode)
        .single()
      clientId = client?.id || null
    }

    // ── 2. Find Campaign (by plusvibe_id or name) ──
    let campaign: { id: string; client_id: string; name: string } | null = null

    if (plusvibeCampId) {
      const { data } = await supabase
        .from('campaigns')
        .select('id, client_id, name')
        .eq('plusvibe_id', plusvibeCampId)
        .single()
      campaign = data
    }
    if (!campaign && campaignName) {
      const { data } = await supabase
        .from('campaigns')
        .select('id, client_id, name')
        .eq('name', campaignName)
        .single()
      campaign = data
    }

    // Use campaign's client_id if we didn't find one via client_code
    if (!clientId && campaign?.client_id) {
      clientId = campaign.client_id
    }

    // ── 3. Find Contact (by email, plusvibe_lead_id, or full_name) ──
    let contact: { id: string; account_id: string | null; replied_count: number; lead_status: string; is_first_reply: boolean | null } | null = null

    if (leadEmail) {
      const { data } = await supabase
        .from('contacts')
        .select('id, account_id, replied_count, lead_status, is_first_reply')
        .eq('email', leadEmail)
        .limit(1)
        .single()
      contact = data
    }
    if (!contact && plusvibeLeadId) {
      const { data } = await supabase
        .from('contacts')
        .select('id, account_id, replied_count, lead_status, is_first_reply')
        .eq('plusvibe_lead_id', plusvibeLeadId)
        .limit(1)
        .single()
      contact = data
    }

    // ── Handle event types ──
    switch (true) {

      // ═══════════════════════════════════════════
      // REPLY — the core flow
      // ═══════════════════════════════════════════
      case eventType.includes('REPLY') || eventType === 'ALL_EMAIL_REPLIES': {
        const cleanedBody = cleanEmailBody(replyBody)
        const companyDomain = companyWebsite
          ? companyWebsite.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()
          : emailToDomain(leadEmail)

        if (contact) {
          // ── Contact EXISTS → update ──
          const isFirstReply = !contact.is_first_reply && (contact.replied_count || 0) === 0
          await supabase.from('contacts').update({
            replied_count: (contact.replied_count || 0) + 1,
            last_reply_at: new Date().toISOString(),
            email_history: cleanedBody,
            is_first_reply: isFirstReply ? true : contact.is_first_reply,
            sender_email: senderEmail || undefined,
          }).eq('id', contact.id)

        } else {
          // ── Contact NOT EXISTS → find/create account, then create contact ──

          // Search for existing account by company name or domain
          let accountId: string | null = null

          if (companyName || companyDomain) {
            // Try domain first (most reliable match)
            if (companyDomain) {
              const { data: byDomain } = await supabase
                .from('accounts')
                .select('id')
                .eq('domain', companyDomain)
                .limit(1)
                .single()
              accountId = byDomain?.id || null
            }
            // Fallback: try company name
            if (!accountId && companyName) {
              const { data: byName } = await supabase
                .from('accounts')
                .select('id')
                .ilike('name', companyName)
                .limit(1)
                .single()
              accountId = byName?.id || null
            }
          }

          // Create new contact
          const { data: newContact } = await supabase.from('contacts').insert({
            client_id: clientId,
            account_id: accountId, // may be null, linked after account creation
            campaign_id: campaign?.id,
            email: leadEmail,
            first_name: firstName,
            last_name: lastName,
            full_name: `${firstName} ${lastName}`.trim(),
            plusvibe_lead_id: plusvibeLeadId,
            plusvibe_campaign_id: plusvibeCampId,
            linkedin_url: personLinkedin || null,
            company: companyName,
            company_website: companyWebsite || null,
            sender_email: senderEmail,
            cc_email: ccEmail || null,
            email_history: cleanedBody,
            is_first_reply: true,
            lead_status: 'replied',
            replied_count: 1,
            last_reply_at: new Date().toISOString(),
          }).select('id').single()

          contact = newContact ? { ...newContact, account_id: accountId, replied_count: 1, lead_status: 'replied', is_first_reply: true } : null

          // If no account found → create one
          if (!accountId && contact) {
            const { data: newAccount } = await supabase.from('accounts').insert({
              client_id: clientId,
              name: companyName || companyDomain || 'Unknown',
              domain: companyDomain || null,
              linkedin_url: companyLinkedin || null,
            }).select('id').single()

            if (newAccount) {
              // Link contact to new account
              await supabase.from('contacts').update({
                account_id: newAccount.id,
              }).eq('id', contact.id)
              contact.account_id = newAccount.id
            }
          }
        }

        // ── Store email message in email_threads ──
        // Use PlusVibe email ID - last_email_id is the message ID for replies
        const emailId = payload.last_email_id || payload.message_id || payload.email_id || payload.id || `reply-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
        
        // Use PlusVibe timestamp if available, otherwise current time
        const sentAt = payload.created_at || payload.modified_at || new Date().toISOString()
        
        // Get HTML body - PlusVibe sends 'body' (HTML) and 'text_body' (plain)
        const htmlBody = payload.body || payload.body_html || null
        
        const insertResult = await supabase.from('email_threads').insert({
          plusvibe_id: emailId,
          thread_id: payload.thread_id || null,
          last_email_id: plusvibeLastEmailId || emailId,
          contact_id: contact?.id,
          campaign_id: campaign?.id,
          email_inbox_id: emailInboxId,
          direction: 'inbound',
          from_email: leadEmail,
          to_email: senderEmail,
          subject: subject,
          body_text: cleanedBody,
          body_html: htmlBody,
          content_preview: cleanedBody?.substring(0, 200),
          label: leadLabel || null,
          is_unread: true,
          sent_at: sentAt,
        })
        
        if (insertResult.error) {
          console.error(`[${requestId}] email_threads insert failed:`, insertResult.error.message)
          // Log error to webhook_logs
          await supabase.from('webhook_logs').insert({
            source: 'plusvibe-error',
            event_type: 'INSERT_ERROR',
            payload: { error: insertResult.error.message, email_id: emailId, lead_email: leadEmail },
            status: 'error',
            error_message: insertResult.error.message,
            request_id: requestId,
          }).catch(() => {})
        } else {
          console.log(`[${requestId}] Email stored: ${emailId}`)
        }

        // ── Call reply-classifier ──
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
            campaign_name: campaign?.name || campaignName,
            client_id: clientId,
            plusvibe_camp_id: plusvibeCampId,
            reply_body: cleanedBody,
            subject: subject,
            first_name: firstName,
            last_name: lastName,
            company_name: companyName,
          }),
        })

        console.log(`Reply processed: ${leadEmail} | campaign: ${campaignName} | contact: ${contact?.id ? 'updated' : 'created'} | account: ${contact?.account_id || 'new'}`)
        break
      }

      // ═══════════════════════════════════════════
      // BOUNCE
      // ═══════════════════════════════════════════
      case eventType === 'BOUNCED_EMAIL': {
        const bounceEmailId = payload.email_id || `bounce-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
        const bounceResult = await supabase.from('email_threads').insert({
          plusvibe_id: bounceEmailId,
          contact_id: contact?.id,
          campaign_id: campaign?.id,
          direction: 'outbound',
          from_email: senderEmail,
          to_email: leadEmail,
          subject: subject,
          body_text: payload.bounce_message || 'Bounced',
          is_unread: true,
          sent_at: new Date().toISOString(),
        })
        
        if (bounceResult.error) {
          console.error('BOUNCED_EMAIL insert failed:', bounceResult.error.message)
        }

        if (contact) {
          await supabase.from('contacts').update({
            bounced: true,
            bounce_message: payload.bounce_message || 'Bounced via webhook',
            lead_status: 'bounced',
          }).eq('id', contact.id)
        }

        await supabase.from('agent_memory').insert({
          agent_id: 'webhook-receiver',
          memory_type: 'bounce_alert',
          content: `Bounce: ${leadEmail} in ${campaignName || plusvibeCampId}`,
          metadata: { email: leadEmail, campaign: campaignName, bounce_message: payload.bounce_message },
        })

        console.log(`Bounce: ${leadEmail}`)
        break
      }

      // ═══════════════════════════════════════════
      // EMAIL SENT
      // ═══════════════════════════════════════════
      case eventType === 'EMAIL_SENT': {
        const sentEmailId = payload.email_id || `sent-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
        const sentResult = await supabase.from('email_threads').insert({
          plusvibe_id: sentEmailId,
          contact_id: contact?.id,
          campaign_id: campaign?.id,
          direction: 'outbound',
          from_email: senderEmail,
          to_email: leadEmail,
          subject: subject,
          body_text: payload.body || '',
          is_unread: false,
          sent_at: new Date().toISOString(),
        })
        
        if (sentResult.error) {
          console.error('EMAIL_SENT insert failed:', sentResult.error.message)
        } else {
          console.log(`Email sent logged: ${sentEmailId} to ${leadEmail}`)
        }

        if (contact && contact.lead_status === 'new') {
          await supabase.from('contacts').update({
            lead_status: 'contacted',
          }).eq('id', contact.id)
        }

        console.log(`Sent: ${leadEmail}`)
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

        console.log(`Label: ${leadEmail} → ${label}`)
        break
      }

      default:
        console.log(`Unhandled event: ${eventType}`)
    }

    return new Response(
      JSON.stringify({ success: true, event: eventType, lead: leadEmail }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const errorMessage = (error as Error).message
    console.error(`[${requestId}] Webhook error:`, errorMessage)

    // Log error to webhook_logs
    await supabase.from('webhook_logs').insert({
      source: 'plusvibe-error',
      event_type: 'EXCEPTION',
      payload: payload,
      status: 'error',
      error_message: errorMessage,
      request_id: requestId,
    }).catch(() => {})

    return new Response(
      JSON.stringify({ success: false, error: errorMessage, request_id: requestId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
