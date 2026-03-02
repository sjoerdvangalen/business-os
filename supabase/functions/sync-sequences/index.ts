import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Sync Sequences — fetches email sequence steps from PlusVibe campaigns
 * and upserts to email_sequences table.
 *
 * For each campaign with a plusvibe_id, fetches the campaign details
 * which include sequence/step configuration.
 *
 * Runs daily via pg_cron.
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

    // 1. Get all campaigns with plusvibe_id
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, plusvibe_id, name, client_id')
      .not('plusvibe_id', 'is', null)

    if (!campaigns || campaigns.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No campaigns with PlusVibe IDs' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Fetching sequences for ${campaigns.length} campaigns`)

    // 2. Load existing sequences for dedup
    const { data: existingSeqs } = await supabase
      .from('email_sequences')
      .select('id, campaign_id, step_number')

    const seqKey = (campId: string, step: number) => `${campId}:${step}`
    const existingMap = new Map<string, string>()
    for (const s of existingSeqs || []) {
      if (s.campaign_id && s.step_number !== null) {
        existingMap.set(seqKey(s.campaign_id, s.step_number), s.id)
      }
    }

    let created = 0, updated = 0, failed = 0

    // 3. Fetch sequence data per campaign from PlusVibe
    for (const campaign of campaigns) {
      try {
        const pvResponse = await fetch(
          `https://api.plusvibe.ai/api/v1/campaign/get?workspace_id=${workspaceId}&campaign_id=${campaign.plusvibe_id}`,
          { headers: { 'x-api-key': apiKey } }
        )

        if (!pvResponse.ok) {
          console.error(`PlusVibe error for campaign ${campaign.plusvibe_id}: ${pvResponse.status}`)
          failed++
          continue
        }

        const pvData = await pvResponse.json()
        const campaignData = pvData.data || pvData.campaign || pvData || {}

        // PlusVibe stores sequences in different possible fields
        const sequences = campaignData.sequences
          || campaignData.steps
          || campaignData.sequence_steps
          || []

        if (!Array.isArray(sequences) || sequences.length === 0) {
          console.log(`No sequences found for campaign ${campaign.name}`)
          continue
        }

        for (let i = 0; i < sequences.length; i++) {
          const step = sequences[i]
          const stepNumber = step.step_number || step.seq_number || step.order || (i + 1)

          // Extract subject/body — PlusVibe might have variants
          const variants = step.variants || step.variations || [step]
          const mainVariant = variants[0] || step

          const seqData: Record<string, unknown> = {
            campaign_id: campaign.id,
            step_number: stepNumber,
            name: step.name || `Step ${stepNumber}`,
            subject: mainVariant.subject || step.subject || '',
            body: mainVariant.body || mainVariant.email_body || step.body || '',
            variation: variants.length > 1 ? 'A' : null,
            wait_time_days: step.wait_days || step.wait_time || step.delay_days || 0,
            is_active: step.is_active !== false,
          }

          // Handle A/B variants
          if (variants.length > 1) {
            // Store variant A as the main sequence
            const existingId = existingMap.get(seqKey(campaign.id, stepNumber))
            try {
              if (existingId) {
                const { error } = await supabase
                  .from('email_sequences')
                  .update(seqData)
                  .eq('id', existingId)
                if (error) { failed++; continue }
                updated++
              } else {
                const { error } = await supabase
                  .from('email_sequences')
                  .insert(seqData)
                if (error) { failed++; continue }
                created++
              }

              // Store variant B+ as separate rows with step_number + 0.1 offset
              for (let v = 1; v < variants.length; v++) {
                const variantStep = stepNumber + v * 0.1
                const varData = {
                  ...seqData,
                  step_number: variantStep,
                  variation: String.fromCharCode(65 + v), // B, C, D...
                  subject: variants[v].subject || '',
                  body: variants[v].body || variants[v].email_body || '',
                }
                const varExisting = existingMap.get(seqKey(campaign.id, variantStep))
                if (varExisting) {
                  await supabase.from('email_sequences').update(varData).eq('id', varExisting)
                  updated++
                } else {
                  await supabase.from('email_sequences').insert(varData)
                  created++
                }
              }
            } catch (e) {
              console.error(`Error for sequence step ${stepNumber}:`, (e as Error).message)
              failed++
            }
          } else {
            // Single variant
            const existingId = existingMap.get(seqKey(campaign.id, stepNumber))
            try {
              if (existingId) {
                const { error } = await supabase
                  .from('email_sequences')
                  .update(seqData)
                  .eq('id', existingId)
                if (error) { failed++; continue }
                updated++
              } else {
                const { error } = await supabase
                  .from('email_sequences')
                  .insert(seqData)
                if (error) { failed++; continue }
                created++
              }
            } catch (e) {
              console.error(`Error for sequence step ${stepNumber}:`, (e as Error).message)
              failed++
            }
          }
        }
      } catch (e) {
        console.error(`Error fetching campaign ${campaign.plusvibe_id}:`, (e as Error).message)
        failed++
      }

      // Rate limit: max 5 req/sec
      await new Promise(r => setTimeout(r, 250))
    }

    // 4. Log to sync_log
    const completedAt = new Date()
    await supabase.from('sync_log').insert({
      source: 'plusvibe',
      table_name: 'email_sequences',
      operation: 'full_sync',
      records_processed: campaigns.length,
      records_created: created,
      records_updated: updated,
      records_failed: failed,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
    })

    console.log(`Sequences: ${created} created, ${updated} updated, ${failed} failed`)

    return new Response(
      JSON.stringify({
        success: true,
        campaigns_processed: campaigns.length,
        created,
        updated,
        failed,
      }),
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
