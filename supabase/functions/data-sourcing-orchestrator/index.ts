import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Data Sourcing Orchestrator — Volledige A-Leads → Validate → Push pipeline
 *
 * Flow:
 *   1. Create sourcing_run record
 *   2. A-Leads sourcing (via gtm-aleads-source) → companies + contacts in Supabase
 *   3. Email waterfall (TryKitt) → contacts.email + email_verified
 *   4. Enrow validation → contacts.email_waterfall_status
 *   5. EmailBison pusher → EB campaign + leads tabel
 *   6. Update sourcing_run status + counters
 *   7. Update workflow_metrics.sourcing_review.status = 'pending'
 *
 * Input:
 *   {
 *     client_id: string,
 *     emailbison_campaign_id: number,
 *     campaign_id?: string,         // Supabase campaigns.id voor leads tabel
 *     cell_id?: string,             // campaign_cells.id (optioneel)
 *     run_type?: string,            // default: 'full'
 *     steps?: string[],             // Subset van steps: ['source','validate','push']
 *     dry_run?: boolean
 *   }
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Invoke een andere edge function via HTTP
async function invokeFunction(
  functionName: string,
  payload: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: `${functionName} returned ${response.status}: ${JSON.stringify(data)}` };
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, error: `${functionName} invoke failed: ${(error as Error).message}` };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  try {
    const body = await req.json();
    const {
      client_id,
      emailbison_campaign_id,
      campaign_id,
      cell_id,
      run_type = 'full',
      steps = ['source', 'validate', 'enrich', 'push'],
      dry_run = false,
    } = body;

    if (!client_id || !emailbison_campaign_id) {
      return new Response(
        JSON.stringify({ error: 'client_id and emailbison_campaign_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    console.log(`[${requestId}] Starting sourcing orchestration for client ${client_id}`);

    // 1. Create sourcing_run record
    const { data: run, error: runError } = await supabase
      .from('sourcing_runs')
      .insert({
        client_id,
        cell_id: cell_id || null,
        run_type,
        status: 'running',
        input_params: { emailbison_campaign_id, campaign_id, steps, dry_run },
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (runError || !run) {
      throw new Error(`Failed to create sourcing_run: ${runError?.message}`);
    }

    const runId = run.id;
    console.log(`[${requestId}] sourcing_run created: ${runId}`);

    const log: Record<string, unknown> = { run_id: runId };

    // 2. A-Leads sourcing (stap: source)
    if (steps.includes('source')) {
      console.log(`[${requestId}] Step: source (gtm-aleads-source)`);

      const sourceResult = await invokeFunction('gtm-aleads-source', {
        client_id,
        cell_id: cell_id || undefined,
        sourcing_run_id: runId,
        dry_run,
      });

      log.source = { success: sourceResult.success, data: sourceResult.data, error: sourceResult.error };

      if (!sourceResult.success) {
        console.error(`[${requestId}] Source step failed: ${sourceResult.error}`);
        // Niet fataal — ga door naar validate/push als er al contacts zijn
      } else {
        // Update counters vanuit source result
        const sourceData = sourceResult.data as Record<string, unknown> ?? {};
        await supabase.from('sourcing_runs').update({
          businesses_found: (sourceData.companies_sourced as number) || 0,
          businesses_new: (sourceData.companies_sourced as number) || 0,
          contacts_found: (sourceData.contacts_created as number) || 0,
          contacts_new: (sourceData.contacts_created as number) || 0,
          updated_at: new Date().toISOString(),
        }).eq('id', runId);

        // gtm-aleads-source doet nu zelf bulk person_search; find-contacts call is redundant
      }
    }

    // 3. Email waterfall — TryKitt voor contacts zonder email
    if (steps.includes('validate')) {
      console.log(`[${requestId}] Step: email-waterfall (TryKitt)`);

      // Haal contacts op zonder email (beperkt tot 200 ivm timeout)
      const { data: contactsNoEmail } = await supabase
        .from('contacts')
        .select('id')
        .eq('client_id', client_id)
        .is('email', null)
        .limit(200);

      if (contactsNoEmail && contactsNoEmail.length > 0) {
        let waterfallSuccess = 0;
        const batchSize = 10;
        for (let i = 0; i < contactsNoEmail.length; i += batchSize) {
          const batch = contactsNoEmail.slice(i, i + batchSize);
          const results = await Promise.all(batch.map(contact =>
            invokeFunction('email-waterfall', {
              contact_id: contact.id,
              sourcing_run_id: runId,
            })
          ));
          for (const result of results) {
            if ((result.data as Record<string, unknown>)?.email) waterfallSuccess++;
          }
        }
        log.waterfall = { processed: contactsNoEmail.length, verified: waterfallSuccess };
        console.log(`[${requestId}] Waterfall: ${waterfallSuccess}/${contactsNoEmail.length} verified`);
      }

      // 4. Enrow validation voor contacts met email maar niet gevalideerd
      console.log(`[${requestId}] Step: validate-leads (Enrow)`);

      const enrowResult = await invokeFunction('validate-leads', {
        client_id,
        cell_id: cell_id || undefined,
        sourcing_run_id: runId,
        batch_size: 500,
        dry_run,
      });

      log.enrow = { success: enrowResult.success, data: enrowResult.data, error: enrowResult.error };

      if (enrowResult.success) {
        const stats = (enrowResult.data as Record<string, unknown>)?.stats as Record<string, number> ?? {};
        await supabase.from('sourcing_runs').update({
          contacts_valid: (stats.valid || 0) + (stats.catch_all || 0),
          updated_at: new Date().toISOString(),
        }).eq('id', runId);
      }
    }

    // 5. AI Enrichment — after validate, before push
    if (steps.includes('enrich')) {
      console.log(`[${requestId}] Step: ai-enrich-contact`);

      const { data: contactsToEnrich } = await supabase
        .from('contacts')
        .select('id')
        .eq('client_id', client_id)
        .not('email', 'is', null)
        .or(`enriched_at.is.null,enriched_at.lt.${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()}`)
        .limit(50);

      if (contactsToEnrich && contactsToEnrich.length > 0) {
        let enrichedCount = 0;
        for (const contact of contactsToEnrich) {
          const result = await invokeFunction('ai-enrich-contact', {
            contact_id: contact.id,
            cell_id: cell_id || undefined,
          });
          if (result.success) enrichedCount++;
        }
        log.enrich = { processed: contactsToEnrich.length, enriched: enrichedCount };
        console.log(`[${requestId}] Enrichment: ${enrichedCount}/${contactsToEnrich.length} enriched`);
      } else {
        log.enrich = { processed: 0, enriched: 0, note: 'no contacts to enrich' };
      }
    }

    // 6. EmailBison pusher
    if (steps.includes('push')) {
      console.log(`[${requestId}] Step: emailbison-pusher`);

      const pushResult = await invokeFunction('emailbison-pusher', {
        client_id,
        emailbison_campaign_id,
        campaign_id: campaign_id || null,
        cell_id: cell_id || null,
        sourcing_run_id: runId,
        dry_run,
      });

      log.push = { success: pushResult.success, data: pushResult.data, error: pushResult.error };

      if (pushResult.success) {
        const pushData = pushResult.data as Record<string, number> ?? {};
        await supabase.from('sourcing_runs').update({
          contacts_pushed: pushData.pushed || 0,
          contacts_suppressed: pushData.dnc_suppressed || 0,
          updated_at: new Date().toISOString(),
        }).eq('id', runId);
      }
    }

    // 7. Update sourcing_run → completed
    await supabase.from('sourcing_runs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', runId);

    // 7. Update workflow_metrics.sourcing_review.status = 'pending' voor handmatige approval
    if (!dry_run) {
      const { data: client } = await supabase
        .from('clients')
        .select('workflow_metrics')
        .eq('id', client_id)
        .single();

      if (client) {
        const wm = (client.workflow_metrics as Record<string, unknown>) ?? {};
        const updated = {
          ...wm,
          sourcing_review: {
            ...((wm.sourcing_review as Record<string, unknown>) ?? {}),
            status: 'pending',
            sourcing_run_id: runId,
            completed_at: new Date().toISOString(),
          },
        };
        await supabase.from('clients').update({ workflow_metrics: updated }).eq('id', client_id);
      }
    }

    console.log(`[${requestId}] Orchestration complete. Run: ${runId}`);

    return new Response(
      JSON.stringify({ success: true, run_id: runId, log }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[${requestId}] Orchestrator error:`, error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
