import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Sync EmailBison Accounts — fetches email accounts from EmailBison API
 * and upserts to email_inboxes table.
 *
 * STRATEGY: Merge with existing inboxes (Tenants-provisioned) based on email address.
 * - Existing inboxes (MICROSOFT365) keep their client_id, domain_id
 * - EmailBison data (provider_inbox_id, warmup scores) is added to existing records
 * - New inboxes are created only if email doesn't exist
 *
 * EmailBison APIs:
 * - GET /api/sender-emails (paginated)
 * - GET /api/warmup/sender-emails (paginated, for warmup scores)
 *
 * Auth: Bearer token
 */

async function fetchAllPages(apiKey: string, baseUrl: string): Promise<any[]> {
  let allData: any[] = []
  let url: string | null = baseUrl
  let pageCount = 0

  while (url) {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }
    })

    if (!response.ok) {
      throw new Error(`EmailBison API error: ${response.status} ${await response.text()}`)
    }

    const data = await response.json()
    const items = data.data || []
    allData = allData.concat(items)
    pageCount++

    // Laravel pagination: links.next is null when no more pages
    url = data.links?.next || null

    if (pageCount > 100) {
      console.warn('Pagination limit reached, stopping')
      break
    }
  }

  return allData
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
    const body = await req.json().catch(() => ({}))
    const apiKey = body.api_key || Deno.env.get('EMAIL_BISON_API_KEY')

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing EMAIL_BISON_API_KEY' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Fetch sender emails from EmailBison
    const senderEmails = await fetchAllPages(apiKey, 'https://mail.scaleyourleads.com/api/sender-emails')
    console.log(`Fetched ${senderEmails.length} sender emails from EmailBison`)

    // Fetch warmup data for warmup scores
    const warmupData = await fetchAllPages(apiKey, 'https://mail.scaleyourleads.com/api/warmup/sender-emails')
    console.log(`Fetched ${warmupData.length} warmup records from EmailBison`)

    // Build warmup lookup map: emailbisonId -> warmupScore
    const warmupMap = new Map<string, { score: number | null; sent: number | null }>()
    for (const w of warmupData) {
      warmupMap.set(String(w.id), {
        score: w.warmup_score ?? null,
        sent: w.warmup_emails_sent ?? null,
      })
    }

    // Pre-load all existing inboxes to match by email
    const { data: existingInboxes } = await supabase
      .from('email_inboxes')
      .select('id, email, client_id, domain_id, provider')

    const emailToInboxMap = new Map<string, typeof existingInboxes extends Array<infer T> ? T : never>()
    for (const inbox of existingInboxes || []) {
      if (inbox.email) {
        emailToInboxMap.set(inbox.email.toLowerCase(), inbox)
      }
    }
    console.log(`Loaded ${emailToInboxMap.size} existing inboxes for matching`)

    let created = 0, updated = 0, merged = 0, failed = 0
    const now = new Date().toISOString()

    // Process each EmailBison account
    for (const acct of senderEmails) {
      const email = acct.email?.toLowerCase() || ''
      const warmup = warmupMap.get(String(acct.id))
      const existing = emailToInboxMap.get(email)

      if (existing) {
        // MERGE: Update existing inbox with EmailBison data
        // Keep existing client_id, domain_id, but add EmailBison IDs and warmup data
        const { error } = await supabase
          .from('email_inboxes')
          .update({
            provider_inbox_id: String(acct.id),
            status: acct.status || existing.status,
            daily_limit: acct.daily_limit || existing.daily_limit,
            warmup_status: acct.warmup_enabled ? 'enabled' : 'disabled',
            warmup_emails_sent_today: warmup?.sent || 0,
            overall_warmup_health: warmup?.score ?? existing.overall_warmup_health,
            last_synced_at: now,
          })
          .eq('id', existing.id)

        if (error) {
          console.error(`Failed to merge ${email}:`, error.message)
          failed++
        } else {
          merged++
        }
      } else {
        // CREATE: New inbox (no existing record found)
        const emailDomain = email.split('@')[1] || ''

        // Try to find domain_id
        const { data: domainData } = await supabase
          .from('domains')
          .select('id')
          .eq('domain', emailDomain)
          .maybeSingle()

        const { error } = await supabase
          .from('email_inboxes')
          .insert({
            provider: 'emailbison',
            provider_inbox_id: String(acct.id),
            client_id: null, // No client association yet
            domain_id: domainData?.id || null,
            email: acct.email,
            first_name: acct.name?.split(' ')[0] || null,
            last_name: acct.name?.split(' ').slice(1).join(' ') || null,
            status: acct.status || null,
            daily_limit: acct.daily_limit || null,
            emails_sent_today: 0,
            warmup_status: acct.warmup_enabled ? 'enabled' : 'disabled',
            warmup_emails_sent_today: warmup?.sent || 0,
            overall_warmup_health: warmup?.score ?? null,
            last_synced_at: now,
          })

        if (error) {
          console.error(`Failed to create ${email}:`, error.message)
          failed++
        } else {
          created++
        }
      }
    }

    // Log to sync_log
    const completedAt = new Date()
    await supabase.from('sync_log').insert({
      source: 'emailbison',
      table_name: 'email_inboxes',
      operation: 'full_sync',
      records_processed: senderEmails.length,
      records_created: created,
      records_updated: merged,
      records_failed: failed,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
    })

    return new Response(
      JSON.stringify({
        success: true,
        total: senderEmails.length,
        created,
        merged,
        failed,
        message: `${merged} existing inboxes merged with EmailBison data, ${created} new inboxes created`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const completedAt = new Date()
    await supabase.from('sync_log').insert({
      source: 'emailbison',
      table_name: 'email_inboxes',
      operation: 'full_sync',
      records_failed: 1,
      error_message: (error as Error).message,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
    })

    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
