import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Sync EmailBison Campaigns — fetches campaigns from EmailBison API
 * and upserts to campaigns table.
 *
 * EmailBison API: https://mail.scaleyourleads.com/api/campaigns
 * Auth: Bearer token
 * Pagination: Laravel style (links.next)
 */

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

    // Fetch all campaigns from EmailBison (paginated)
    let allCampaigns: any[] = []
    let url: string | null = 'https://mail.scaleyourleads.com/api/campaigns'
    let pageCount = 0

    while (url) {
      const ebResponse = await fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }
      })

      if (!ebResponse.ok) {
        throw new Error(`EmailBison API error: ${ebResponse.status} ${await ebResponse.text()}`)
      }

      const data = await ebResponse.json()
      const campaigns = data.data || []
      allCampaigns = allCampaigns.concat(campaigns)
      pageCount++

      // Laravel pagination: links.next is null when no more pages
      url = data.links?.next || null

      if (pageCount > 100) {
        console.warn('Pagination limit reached, stopping')
        break
      }
    }

    console.log(`Fetched ${allCampaigns.length} campaigns from EmailBison (${pageCount} pages)`)

    // Pre-load all clients for client_code lookup
    const { data: clients } = await supabase.from('clients').select('id, client_code')
    const clientMap = new Map<string, string>()
    for (const c of clients || []) {
      if (c.client_code) clientMap.set(c.client_code.toUpperCase(), c.id)
    }

    // Pre-load existing EmailBison campaigns for matching
    const { data: existingCampaigns } = await supabase
      .from('campaigns')
      .select('id, name, client_id, provider_campaign_id')
      .eq('provider', 'emailbison')

    // Build lookup maps
    const byProviderId = new Map<string, any>()
    const byNameClient = new Map<string, any>()
    for (const ec of existingCampaigns || []) {
      if (ec.provider_campaign_id) byProviderId.set(ec.provider_campaign_id, ec)
      if (ec.name && ec.client_id) byNameClient.set(`${ec.name}::${ec.client_id}`, ec)
    }

    let created = 0, updated = 0, skipped = 0, failed = 0

    for (const camp of allCampaigns) {
      // Client matching: same convention as PlusVibe — "CLIENT_CODE | Language | Description"
      const clientCode = camp.name?.split('|')[0]?.trim()?.toUpperCase()
      const clientId = clientCode ? clientMap.get(clientCode) : null

      if (!clientId) {
        console.log(`No client found for campaign: ${camp.name} (code: ${clientCode})`)
        skipped++
        continue
      }

      const campaignData = {
        provider: 'emailbison',
        provider_campaign_id: String(camp.id),
        client_id: clientId,
        name: camp.name,
        status: camp.status?.toLowerCase(),
        total_leads: camp.total_leads || 0,
        leads_contacted: camp.total_leads_contacted || 0,
        leads_completed: 0,  // EmailBison doesn't track this
        emails_sent: camp.emails_sent || 0,
        replies: camp.replied || 0,
        positive_replies: camp.interested || 0,
        bounces: camp.bounced || 0,
        reply_rate: camp.emails_sent > 0 ? Math.round((camp.replied || 0) / camp.emails_sent * 10000) / 100 : 0,
        bounce_rate: camp.emails_sent > 0 ? Math.round((camp.bounced || 0) / camp.emails_sent * 10000) / 100 : 0,
        positive_rate: camp.replied > 0 ? Math.round((camp.interested || 0) / camp.replied * 10000) / 100 : 0,
        daily_limit: camp.max_emails_per_day,
        updated_at: new Date().toISOString(),
      }

      try {
        // Strategy: check if campaign exists by provider_campaign_id first, then by name+client
        const existing = byProviderId.get(String(camp.id)) ||
                        byNameClient.get(`${camp.name}::${clientId}`)

        if (existing) {
          // Update existing campaign
          const { error } = await supabase
            .from('campaigns')
            .update(campaignData)
            .eq('id', existing.id)

          if (error) {
            console.error(`Update failed for "${camp.name}":`, error.message)
            failed++
          } else {
            updated++
          }
        } else {
          // Insert new campaign
          const { error } = await supabase
            .from('campaigns')
            .insert(campaignData)

          if (error) {
            console.error(`Insert failed for "${camp.name}":`, error.message)
            failed++
          } else {
            created++
          }
        }
      } catch (e) {
        console.error(`Error for "${camp.name}":`, e)
        failed++
      }
    }

    // Log to sync_log
    const completedAt = new Date()
    await supabase.from('sync_log').insert({
      source: 'emailbison',
      table_name: 'campaigns',
      operation: 'full_sync',
      records_processed: allCampaigns.length,
      records_created: created,
      records_updated: updated,
      records_failed: failed,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
    })

    return new Response(
      JSON.stringify({ success: true, total: allCampaigns.length, created, updated, skipped, failed, pages: pageCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const completedAt = new Date()
    await supabase.from('sync_log').insert({
      source: 'emailbison',
      table_name: 'campaigns',
      operation: 'full_sync',
      records_failed: 1,
      error_message: (error as Error).message,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
    })

    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
