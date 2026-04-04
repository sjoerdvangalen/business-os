import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Sync Sequences — fetches email sequences from PlusVibe campaign list
 * and upserts to email_sequences table.
 *
 * PlusVibe includes sequences[] in the campaign list-all response.
 * Each sequence has: step, wait_time, variations[{variation, subject, body}]
 *
 * Runs every 15 min via pg_cron.
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
    const apiKey = body.api_key || Deno.env.get('PLUSVIBE_API_KEY')
    const workspaceId = body.workspace_id || Deno.env.get('PLUSVIBE_WORKSPACE_ID')

    if (!apiKey || !workspaceId) {
      return new Response(
        JSON.stringify({ error: 'Missing PLUSVIBE_API_KEY or PLUSVIBE_WORKSPACE_ID' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // 1. Fetch all campaigns from PlusVibe (includes sequences)
    const pvResponse = await fetch(
      `https://api.plusvibe.ai/api/v1/campaign/list-all?workspace_id=${workspaceId}`,
      { headers: { 'x-api-key': apiKey } }
    )
    if (!pvResponse.ok) throw new Error(`PlusVibe API error: ${pvResponse.status}`)

    const pvCampaigns = await pvResponse.json()
    console.log(`Fetched ${pvCampaigns.length} campaigns from PlusVibe`)

    // 2. Map PlusVibe campaign IDs to our campaign UUIDs
    const { data: ourCampaigns } = await supabase
      .from('campaigns')
      .select('id, provider_campaign_id')
      .eq('provider', 'plusvibe')
      .not('provider_campaign_id', 'is', null)

    const pvToUuid = new Map<string, string>()
    for (const c of ourCampaigns || []) {
      if (c.provider_campaign_id) pvToUuid.set(c.provider_campaign_id, c.id)
    }

    // 3. Load existing sequences for dedup
    const { data: existingSeqs } = await supabase
      .from('email_sequences')
      .select('id, campaign_id, step_number, variation')

    const seqKey = (campId: string, step: number, variation: string | null) =>
      `${campId}:${step}:${variation || 'A'}`
    const existingMap = new Map<string, string>()
    for (const s of existingSeqs || []) {
      if (s.campaign_id && s.step_number !== null) {
        existingMap.set(seqKey(s.campaign_id, s.step_number, s.variation), s.id)
      }
    }

    let created = 0, updated = 0, failed = 0, skipped = 0

    // 4. Process each campaign's sequences
    for (const pvCamp of pvCampaigns) {
      const campaignId = pvToUuid.get(pvCamp.id)
      if (!campaignId) { skipped++; continue }

      const sequences = pvCamp.sequences || []
      if (sequences.length === 0) continue

      for (const seq of sequences) {
        const stepNumber = seq.step || 1
        const waitTime = seq.wait_time || 0
        const variations = seq.variations || []

        if (variations.length === 0) continue

        for (const v of variations) {
          const variationLabel = v.variation || 'A'
          const key = seqKey(campaignId, stepNumber, variationLabel)

          const seqData = {
            campaign_id: campaignId,
            step_number: stepNumber,
            name: v.name || `Step ${stepNumber}${variations.length > 1 ? ` (${variationLabel})` : ''}`,
            subject: v.subject || '',
            body: v.body || '',
            variation: variationLabel,
            wait_time_days: waitTime,
            is_active: true,
            // Stats — PlusVibe returns these on the variation object
            sent: v.sent_count ?? v.sent ?? v.emails_sent ?? 0,
            replies: v.replied_count ?? v.replies ?? v.reply_count ?? 0,
            positive_replies: v.positive_reply_count ?? v.positive_replies ?? v.interested_count ?? 0,
          }

          try {
            const existingId = existingMap.get(key)
            if (existingId) {
              const { error } = await supabase
                .from('email_sequences')
                .update(seqData)
                .eq('id', existingId)
              if (error) {
                console.error(`Update seq step ${stepNumber}${variationLabel}:`, error.message)
                failed++
              } else {
                updated++
              }
            } else {
              const { error } = await supabase
                .from('email_sequences')
                .insert(seqData)
              if (error) {
                console.error(`Insert seq step ${stepNumber}${variationLabel}:`, error.message)
                failed++
              } else {
                created++
              }
            }
          } catch (e) {
            console.error(`Error seq step ${stepNumber}:`, (e as Error).message)
            failed++
          }
        }
      }
    }

    // 5. Log to sync_log
    const completedAt = new Date()
    await supabase.from('sync_log').insert({
      source: 'plusvibe',
      table_name: 'email_sequences',
      operation: 'full_sync',
      records_processed: pvCampaigns.length,
      records_created: created,
      records_updated: updated,
      records_failed: failed,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
    })

    console.log(`Sequences: ${created} created, ${updated} updated, ${failed} failed, ${skipped} campaigns skipped`)

    return new Response(
      JSON.stringify({ success: true, campaigns: pvCampaigns.length, created, updated, failed, skipped }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const completedAt = new Date()
    await supabase.from('sync_log').insert({
      source: 'plusvibe',
      table_name: 'email_sequences',
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
