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

    // Pre-load campaigns for campaign_id + client_id lookup
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, client_id, plusvibe_id')
    const campaignMap = new Map<string, { id: string; client_id: string }>()
    for (const c of campaigns || []) {
      if (c.plusvibe_id) campaignMap.set(c.plusvibe_id, { id: c.id, client_id: c.client_id })
    }

    // Pre-load existing contacts by plusvibe_lead_id for dedup
    const { data: existingContacts } = await supabase
      .from('contacts')
      .select('id, plusvibe_lead_id, email')
    const byPlusvibeId = new Map<string, string>()
    const byEmail = new Map<string, string>()
    for (const c of existingContacts || []) {
      if (c.plusvibe_lead_id) byPlusvibeId.set(c.plusvibe_lead_id, c.id)
      if (c.email) byEmail.set(c.email.toLowerCase(), c.id)
    }

    let created = 0, updated = 0, skipped = 0, failed = 0
    let page = 1
    let hasMore = true
    const pageSize = 100

    while (hasMore) {
      // Fetch leads page from PlusVibe
      const pvResponse = await fetch(
        `https://api.plusvibe.ai/api/v1/lead/list/workspace?workspace_id=${workspaceId}&limit=${pageSize}&page=${page}`,
        { headers: { 'x-api-key': apiKey } }
      )
      if (!pvResponse.ok) throw new Error(`PlusVibe API error: ${pvResponse.status}`)

      const result = await pvResponse.json()
      const leads = result.leads || result.data || result || []

      if (!Array.isArray(leads) || leads.length === 0) {
        hasMore = false
        break
      }

      console.log(`Page ${page}: ${leads.length} leads`)

      for (const lead of leads) {
        const campaignInfo = lead.camp_id ? campaignMap.get(lead.camp_id) : null

        const contactData: Record<string, unknown> = {
          plusvibe_lead_id: lead.id || lead._id,
          email: lead.email,
          first_name: lead.first_name || lead.firstName,
          last_name: lead.last_name || lead.lastName,
          company: lead.company || lead.company_name,
          position: lead.title || lead.position || lead.job_title,
          linkedin_url: lead.linkedin_url || lead.li_url,
          phone: lead.phone || lead.phone_number,
          city: lead.city,
          state: lead.state,
          country: lead.country,
          industry: lead.industry,
          company_website: lead.website || lead.company_website,
          label: lead.label,
          lead_source: lead.lead_source || 'plusvibe',
          source: 'plusvibe',
          lead_status: mapLeadStatus(lead.status, lead.label),
          campaign_id: campaignInfo?.id || null,
          client_id: campaignInfo?.client_id || null,
          plusvibe_campaign_id: lead.camp_id || null,
          opened_count: lead.opened_count || 0,
          replied_count: lead.replied_count || 0,
          bounced: lead.is_bounced || false,
          bounce_message: lead.bounce_message || null,
          lead_score: lead.lead_score || 0,
        }

        // Remove null/undefined values
        for (const key of Object.keys(contactData)) {
          if (contactData[key] === undefined) delete contactData[key]
        }

        try {
          const leadPvId = (lead.id || lead._id)?.toString()
          const existingId = leadPvId ? byPlusvibeId.get(leadPvId) : null
          const existingByEmail = lead.email ? byEmail.get(lead.email.toLowerCase()) : null
          const existing = existingId || existingByEmail

          if (existing) {
            const { error } = await supabase
              .from('contacts')
              .update(contactData)
              .eq('id', existing)
            if (error) {
              console.error(`Update failed for "${lead.email}":`, error.message)
              failed++
            } else {
              updated++
            }
          } else {
            const { error } = await supabase
              .from('contacts')
              .insert(contactData)
            if (error) {
              console.error(`Insert failed for "${lead.email}":`, error.message)
              failed++
            } else {
              created++
              // Add to lookup maps for dedup within this run
              if (leadPvId) byPlusvibeId.set(leadPvId, 'new')
              if (lead.email) byEmail.set(lead.email.toLowerCase(), 'new')
            }
          }
        } catch (e) {
          console.error(`Error for "${lead.email}":`, e)
          failed++
        }
      }

      // PlusVibe pagination: if we got fewer than pageSize, we're done
      if (leads.length < pageSize) {
        hasMore = false
      } else {
        page++
      }

      // Rate limit: max 5 req/sec for PlusVibe API
      await new Promise(r => setTimeout(r, 250))
    }

    // Log to sync_log
    const completedAt = new Date()
    await supabase.from('sync_log').insert({
      source: 'plusvibe',
      table_name: 'contacts',
      operation: 'full_sync',
      records_processed: created + updated + skipped + failed,
      records_created: created,
      records_updated: updated,
      records_failed: failed,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
    })

    return new Response(
      JSON.stringify({ success: true, pages: page, created, updated, skipped, failed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const completedAt = new Date()
    await supabase.from('sync_log').insert({
      source: 'plusvibe',
      table_name: 'contacts',
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

function mapLeadStatus(pvStatus: string | undefined, label: string | undefined): string {
  if (!pvStatus && !label) return 'new'

  // Map PlusVibe statuses
  const status = (pvStatus || '').toLowerCase()
  if (status === 'completed' || status === 'complete') return 'completed'
  if (status === 'in_progress' || status === 'inprogress') return 'contacted'

  // Map labels to status
  const lbl = (label || '').toLowerCase()
  if (lbl.includes('interested') || lbl.includes('positive')) return 'interested'
  if (lbl.includes('meeting') || lbl.includes('booked')) return 'meeting_booked'
  if (lbl.includes('not_interested') || lbl.includes('negative')) return 'not_interested'
  if (lbl.includes('ooo') || lbl.includes('out_of_office')) return 'ooo'

  return 'new'
}
