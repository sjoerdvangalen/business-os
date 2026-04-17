import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const apiKey = body.api_key || Deno.env.get('PLUSVIBE_API_KEY')
    const workspaceId = body.workspace_id || Deno.env.get('PLUSVIBE_WORKSPACE_ID')

    if (!apiKey || !workspaceId) {
      return new Response(
        JSON.stringify({ error: 'Missing PLUSVIBE_API_KEY or PLUSVIBE_WORKSPACE_ID' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Fetch all campaigns from PlusVibe
    const pvResponse = await fetch(
      `https://api.plusvibe.ai/api/v1/campaign/list-all?workspace_id=${workspaceId}`,
      { headers: { 'x-api-key': apiKey } }
    )
    if (!pvResponse.ok) throw new Error(`PlusVibe API error: ${pvResponse.status}`)

    const campaigns = await pvResponse.json()
    console.log(`Fetched ${campaigns.length} campaigns from PlusVibe`)

    // Pre-load all clients for client_code lookup
    const { data: clients } = await supabase.from('clients').select('id, client_code')
    const clientMap = new Map<string, string>()
    for (const c of clients || []) {
      if (c.client_code) clientMap.set(c.client_code.toUpperCase(), c.id)
    }

    // Pre-load existing campaigns for matching
    const { data: existingCampaigns } = await supabase
      .from('campaigns')
      .select('id, name, client_id, provider_campaign_id')

    // Build lookup maps
    const byProviderId = new Map<string, any>()
    const byNameClient = new Map<string, any>()
    for (const ec of existingCampaigns || []) {
      if (ec.provider_campaign_id) byProviderId.set(ec.provider_campaign_id, ec)
      if (ec.name && ec.client_id) byNameClient.set(`${ec.name}::${ec.client_id}`, ec)
    }

    let created = 0, updated = 0, skipped = 0, failed = 0

    for (const camp of campaigns) {
      const clientCode = camp.camp_name?.split('|')[0]?.trim()?.toUpperCase()
      const clientId = clientCode ? clientMap.get(clientCode) : null

      if (!clientId) {
        skipped++
        continue
      }

      const campaignData = {
        provider: 'plusvibe',
        provider_campaign_id: camp.id,
        client_id: clientId,
        name: camp.camp_name,
        status: camp.status?.toLowerCase(),
        total_leads: camp.lead_count || 0,
        leads_contacted: camp.lead_contacted_count || 0,
        leads_completed: camp.completed_lead_count || 0,
        emails_sent: camp.sent_count || 0,
        replies: camp.replied_count || 0,
        positive_replies: camp.positive_reply_count || 0,
        bounces: camp.bounced_count || 0,
        reply_rate: camp.replied_rate || 0,
        bounce_rate: camp.sent_count > 0 ? Math.round((camp.bounced_count || 0) / camp.sent_count * 10000) / 100 : 0,
        positive_rate: camp.replied_count > 0 ? Math.round((camp.positive_reply_count || 0) / camp.replied_count * 10000) / 100 : 0,
        daily_limit: camp.daily_limit,
        updated_at: new Date().toISOString(),
      }

      try {
        // Strategy: check if campaign exists by provider_campaign_id first, then by name+client
        const existing = byProviderId.get(camp.id) || byNameClient.get(`${camp.camp_name}::${clientId}`)

        if (existing) {
          // Update existing campaign
          const { error } = await supabase
            .from('campaigns')
            .update(campaignData)
            .eq('id', existing.id)

          if (error) {
            console.error(`Update failed for "${camp.camp_name}":`, error.message)
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
            console.error(`Insert failed for "${camp.camp_name}":`, error.message)
            failed++
          } else {
            created++
          }
        }
      } catch (e) {
        console.error(`Error for "${camp.camp_name}":`, e)
        failed++
      }
    }

    // Log to sync_log
    const completedAt = new Date()
    await supabase.from('sync_log').insert({
      source: 'plusvibe',
      table_name: 'campaigns',
      operation: 'full_sync',
      records_processed: campaigns.length,
      records_created: created,
      records_updated: updated,
      records_failed: failed,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
    })


    return new Response(
      JSON.stringify({ success: true, total: campaigns.length, created, updated, skipped, failed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const completedAt = new Date()
    await supabase.from('sync_log').insert({
      source: 'plusvibe',
      table_name: 'campaigns',
      operation: 'full_sync',
      records_failed: 1,
      error_message: error.message,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
    })


    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
