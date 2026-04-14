import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Validate Leads — Email validation via Enrow (standalone, no PlusVibe)
 *
 * Flow:
 *   contacts (email not null, not yet validated)
 *     → Enrow validation
 *       → update contacts.email_verified + email_waterfall_status
 *       → log to contact_validation_log
 *
 * Input: { contact_ids?: string[], batch_size?: number, dry_run?: boolean, client_id?: string, cell_id?: string, sourcing_run_id?: string }
 * Output: { processed: number, valid: number, catch_all: number, invalid: number, unknown: number }
 */

const ENROW_API_KEY = Deno.env.get('ENROW_API_KEY');
const ENROW_BASE_URL = 'https://api.enrow.io/v1';

interface Contact {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  client_id: string | null;
}

interface EnrowResult {
  email: string;
  status: 'valid' | 'catch_all' | 'invalid' | 'unknown';
  confidence: number;
  raw_response?: Record<string, unknown>;
}

async function validateWithEnrow(email: string): Promise<EnrowResult> {
  try {
    const response = await fetch(`${ENROW_BASE_URL}/verify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ENROW_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        await new Promise(r => setTimeout(r, 2000));
        return validateWithEnrow(email);
      }
      throw new Error(`Enrow API error: ${response.status}`);
    }

    const data = await response.json();

    let status: EnrowResult['status'] = 'unknown';
    if (data.status === 'valid') status = 'valid';
    else if (data.status === 'catch_all' || data.status === 'accept_all') status = 'catch_all';
    else if (data.status === 'invalid') status = 'invalid';

    return {
      email,
      status,
      confidence: data.confidence || data.score || 0,
      raw_response: data,
    };
  } catch (error) {
    console.error('Enrow validation failed:', error);
    return { email, status: 'unknown', confidence: 0 };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startedAt = new Date();

  try {
    const body = await req.json().catch(() => ({}));
    const {
      contact_ids,
      batch_size = 100,
      dry_run = false,
      client_id,
      cell_id,
      sourcing_run_id,
    } = body;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // If cell_id provided, resolve contact_ids from leads table
    let resolvedContactIds = contact_ids;
    if (cell_id) {
      const { data: cellLeads } = await supabase
        .from('leads')
        .select('contact_id')
        .eq('cell_id', cell_id);
      const leadContactIds = (cellLeads ?? []).map((l: any) => l.contact_id);
      if (contact_ids?.length > 0) {
        resolvedContactIds = contact_ids.filter((id: string) => leadContactIds.includes(id));
      } else {
        resolvedContactIds = leadContactIds;
      }
    }

    // Haal contacts op met email maar zonder validatie (email_verified is null)
    let query = supabase
      .from('contacts')
      .select('id, email, first_name, last_name, client_id')
      .not('email', 'is', null)
      .is('email_verified', null)
      .limit(batch_size);

    if (resolvedContactIds?.length > 0) {
      query = query.in('id', resolvedContactIds);
    } else if (cell_id) {
      // Cell provided but no leads/contacts found — return empty
      return new Response(
        JSON.stringify({ message: 'No contacts to validate for this cell', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (client_id) {
      query = query.eq('client_id', client_id);
    }

    const { data: contacts, error: contactsError } = await query;

    if (contactsError) throw new Error(`Failed to fetch contacts: ${contactsError.message}`);

    if (!contacts || contacts.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No contacts to validate', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const stats = { processed: 0, valid: 0, catch_all: 0, invalid: 0, unknown: 0, errors: 0 };

    for (const contact of contacts as Contact[]) {
      try {
        console.log(`Validating: ${contact.email}`);

        const enrowResult = await validateWithEnrow(contact.email);
        const isVerified = enrowResult.status === 'valid' || enrowResult.status === 'catch_all';

        // Map status to waterfall status
        const waterfallStatus = enrowResult.status === 'valid' ? 'verified'
          : enrowResult.status === 'catch_all' ? 'catch_all'
          : enrowResult.status === 'invalid' ? 'invalid'
          : 'unknown';

        stats[enrowResult.status]++;
        stats.processed++;

        if (!dry_run) {
          // Update contact
          await supabase.from('contacts').update({
            email_verified: isVerified,
            email_verified_at: new Date().toISOString(),
            email_waterfall_status: waterfallStatus,
          }).eq('id', contact.id);

          // Log naar contact_validation_log
          await supabase.from('contact_validation_log').insert({
            contact_id: contact.id,
            sourcing_run_id: sourcing_run_id || null,
            enrow_result: enrowResult.raw_response || { status: enrowResult.status, confidence: enrowResult.confidence },
            final_status: isVerified ? 'valid' : enrowResult.status === 'invalid' ? 'invalid' : 'unknown',
            final_method: 'enrow',
          });
        }

        // Rate limiting: ~5 req/sec
        await new Promise(r => setTimeout(r, 200));

      } catch (error) {
        console.error(`Error processing contact ${contact.id}:`, error);
        stats.errors++;
      }
    }

    // Log naar sync_log
    const completedAt = new Date();
    await supabase.from('sync_log').insert({
      source: 'validate_leads_enrow',
      table_name: 'contacts',
      operation: dry_run ? 'dry_run' : 'validate',
      records_processed: stats.processed,
      records_created: stats.valid + stats.catch_all,
      records_failed: stats.invalid + stats.errors,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
      metadata: stats,
    });

    return new Response(
      JSON.stringify({ success: true, dry_run, stats }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Validate leads error:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
