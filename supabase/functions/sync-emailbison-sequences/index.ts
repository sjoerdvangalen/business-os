import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Sync EmailBison Sequences — fetches sequence steps from EmailBison API
 * and upserts to email_sequences table.
 *
 * EmailBison requires separate API call per campaign:
 * GET /api/campaigns/v1.1/{campaign_id}/sequence-steps
 *
 * Auth: Bearer token
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

    // 1. Get all EmailBison campaigns from our database
    const { data: emailbisonCampaigns, error: campError } = await supabase
      .from('campaigns')
      .select('id, provider_campaign_id')
      .eq('provider', 'emailbison')
      .not('provider_campaign_id', 'is', null)

    if (campError) throw new Error(`Failed to load campaigns: ${campError.message}`)

    console.log(`Found ${emailbisonCampaigns?.length || 0} EmailBison campaigns to sync sequences for`)

    // 2. Load existing sequences for dedup
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

    // 3. Process each campaign's sequences
    for (const campaign of emailbisonCampaigns || []) {
      const campaignId = campaign.id
      const emailbisonCampId = campaign.provider_campaign_id

      if (!emailbisonCampId) {
        skipped++
        continue
      }

      try {
        // Fetch sequences for this campaign
        const seqResponse = await fetch(
          `https://mail.scaleyourleads.com/api/campaigns/v1.1/${emailbisonCampId}/sequence-steps`,
          { headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' } }
        )

        if (!seqResponse.ok) {
          console.error(`Failed to fetch sequences for campaign ${emailbisonCampId}: ${seqResponse.status}`)
          failed++
          continue
        }

        const seqData = await seqResponse.json()
        const steps = seqData.data?.sequence_steps || []

        if (steps.length === 0) {
          continue
        }

        // Fetch stats for this campaign to get sequence-level KPIs
        const statsResponse = await fetch(
          `https://mail.scaleyourleads.com/api/campaigns/${emailbisonCampId}/stats`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              start_date: '2024-01-01',
              end_date: new Date().toISOString().split('T')[0]  // Today
            })
          }
        )

        // Build stats lookup map: sequence_step_id -> stats
        const statsMap = new Map<string, { sent: number; replies: number; positive_replies: number }>()
        if (statsResponse.ok) {
          const statsData = await statsResponse.json()
          const stepStats = statsData.data?.sequence_step_stats || []
          for (const stat of stepStats) {
            statsMap.set(String(stat.sequence_step_id), {
              sent: stat.sent || 0,
              replies: stat.unique_replies || 0,
              positive_replies: stat.interested || 0
            })
          }
        }

        for (const step of steps) {
          const stepNumber = parseInt(step.order) || 1
          const variationLabel = step.variant ? 'B' : 'A'
          const key = seqKey(campaignId, stepNumber, variationLabel)

          // Get stats for this step (if available)
          const stats = statsMap.get(String(step.id)) || { sent: 0, replies: 0, positive_replies: 0 }

          const seqRecord = {
            campaign_id: campaignId,
            step_number: stepNumber,
            name: step.email_subject || `Step ${stepNumber}`,
            subject: step.email_subject || '',
            body: step.email_body || '',
            variation: variationLabel,
            wait_time_days: parseInt(step.wait_in_days) || 0,
            is_active: step.active !== false,
            // Stats from EmailBison stats endpoint
            sent: stats.sent,
            replies: stats.replies,
            positive_replies: stats.positive_replies,
          }

          try {
            const existingId = existingMap.get(key)
            if (existingId) {
              const { error } = await supabase
                .from('email_sequences')
                .update(seqRecord)
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
                .insert(seqRecord)
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
      } catch (e) {
        console.error(`Error processing campaign ${emailbisonCampId}:`, (e as Error).message)
        failed++
      }
    }

    // 5. Log to sync_log
    const completedAt = new Date()
    await supabase.from('sync_log').insert({
      source: 'emailbison',
      table_name: 'email_sequences',
      operation: 'full_sync',
      records_processed: emailbisonCampaigns?.length || 0,
      records_created: created,
      records_updated: updated,
      records_failed: failed,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
    })

    console.log(`Sequences: ${created} created, ${updated} updated, ${failed} failed`)

    return new Response(
      JSON.stringify({ success: true, campaigns: emailbisonCampaigns?.length || 0, created, updated, failed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const completedAt = new Date()
    await supabase.from('sync_log').insert({
      source: 'emailbison',
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
