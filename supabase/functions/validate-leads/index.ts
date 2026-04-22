import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Validate Leads — Email validation via Enrow or OmniVerifier
 *
 * Flow (method=enrow):
 *   contacts → Enrow validation → update contacts + log
 *
 * Flow (method=omni):
 *   contacts → OmniVerifier parallel (50 concurrent) → update contacts + log
 *   → invalid/unknown trigger email-waterfall (force_search)
 *
 * Input: { contact_ids?: string[], batch_size?: number, dry_run?: boolean,
 *          client_id?: string, cell_id?: string, sourcing_run_id?: string,
 *          method?: 'enrow' | 'omni' }
 * Output: { processed: number, valid: number, catch_all: number, invalid: number, unknown: number }
 */

const ENROW_API_KEY = Deno.env.get('ENROW_API_KEY');
const ENROW_BASE_URL = 'https://api.enrow.io';
const ENROW_POLL_MS = 1000;
const ENROW_POLL_MAX = 15;

const OMNIVERIFIER_API_KEY = Deno.env.get('OMNIVERIFIER_API_KEY') ?? '';
const OMNIVERIFIER_BASE_URL = 'https://api.omniverifier.com/v1/validate';

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

interface OmniResult {
  valid: boolean;
  catchall: boolean;
  result: string;
}

// ── Enrow helpers ────────────────────────────────────────────────────────────

async function pollEnrow(jobId: string, endpoint: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < ENROW_POLL_MAX; i++) {
    await new Promise(r => setTimeout(r, ENROW_POLL_MS));
    const res = await fetch(`${ENROW_BASE_URL}${endpoint}?id=${jobId}`, {
      headers: { 'x-api-key': ENROW_API_KEY || '' },
    });
    if (!res.ok) continue;
    const data = await res.json() as Record<string, unknown>;
    if (data.qualification || data.email) return data;
  }
  return { status: 'timeout' };
}

async function validateWithEnrow(email: string): Promise<EnrowResult> {
  try {
    const response = await fetch(`${ENROW_BASE_URL}/email/verify/single`, {
      method: 'POST',
      headers: {
        'x-api-key': ENROW_API_KEY || '',
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

    const init = await response.json() as { id?: string; message?: string };
    if (!init.id) throw new Error('Enrow verify: no job id returned');

    const data = await pollEnrow(init.id, '/email/verify/single');
    const qualification = String(data.qualification || '').toLowerCase();

    let status: EnrowResult['status'] = 'unknown';
    if (qualification === 'valid') status = 'valid';
    else if (qualification === 'catchall' || qualification === 'catch_all' || qualification === 'accept_all') status = 'catch_all';
    else if (qualification === 'invalid') status = 'invalid';

    return {
      email,
      status,
      confidence: qualification === 'valid' ? 1 : qualification === 'catchall' ? 0.7 : 0,
      raw_response: data,
    };
  } catch (error) {
    console.error('Enrow validation failed:', error);
    return { email, status: 'unknown', confidence: 0 };
  }
}

// ── OmniVerifier helpers ───────────────────────────────────────────────────

async function validateWithOmni(email: string): Promise<OmniResult> {
  if (!OMNIVERIFIER_API_KEY) return { valid: false, catchall: false, result: 'skipped_no_key' };
  try {
    const resp = await fetch(`${OMNIVERIFIER_BASE_URL}/email/check`, {
      method: 'POST',
      headers: { 'x-api-key': OMNIVERIFIER_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!resp.ok) {
      console.warn(`OmniVerifier ${resp.status} for ${email} — treating as unknown`);
      return { valid: false, catchall: false, result: `omni_${resp.status}` };
    }
    const data = await resp.json() as { status?: string; mail_server?: string };
    const result = (data.status ?? '').toLowerCase();
    return {
      valid: result === 'valid' || result === 'catch-all',
      catchall: result === 'catch-all',
      result,
    };
  } catch {
    return { valid: false, catchall: false, result: 'omni_error' };
  }
}

// ── DNC helpers ──────────────────────────────────────────────────────────────

async function fetchDncForBatch(
  supabase: ReturnType<typeof createClient>,
  contacts: Contact[],
  clientId?: string
): Promise<{ dncEmails: Set<string>; dncDomains: Set<string> }> {
  const nowIso = new Date().toISOString();
  const batchEmails = contacts.map(c => c.email.toLowerCase());
  const batchDomains = [...new Set(batchEmails.map(e => e.split('@')[1]).filter(Boolean))];

  const { data: dncRows } = await supabase
    .from('dnc_entities')
    .select('entity_type, entity_value, reason, client_id')
    .or(`entity_type.eq.email,entity_type.eq.domain`)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .in('entity_value', [...batchEmails, ...batchDomains]);

  const dncEmails = new Set(
    (dncRows ?? [])
      .filter((r: any) => r.entity_type === 'email' && (r.client_id === null || r.client_id === clientId))
      .map((r: any) => r.entity_value)
  );
  const dncDomains = new Set(
    (dncRows ?? [])
      .filter((r: any) => r.entity_type === 'domain' && (r.client_id === null || r.client_id === clientId))
      .map((r: any) => r.entity_value)
  );

  return { dncEmails, dncDomains };
}

// ── Main handler ─────────────────────────────────────────────────────────────

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
      method = 'enrow',
    } = body;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Resolve contact_ids from cell_id if needed
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

    // Fetch contacts
    let query = supabase
      .from('contacts')
      .select('id, email, first_name, last_name, client_id')
      .not('email', 'is', null)
      .or('email_verified.is.null,email_verified.eq.false');

    // For omni method we can handle larger batches; cap at 500 for safety
    const limit = method === 'omni' ? Math.min(batch_size, 500) : Math.min(batch_size, 100);
    query = query.limit(limit);

    if (resolvedContactIds?.length > 0) {
      query = query.in('id', resolvedContactIds);
    } else if (cell_id) {
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

    const stats = { processed: 0, valid: 0, catch_all: 0, invalid: 0, unknown: 0, errors: 0, skipped_dnc: 0 };

    // DNC pre-check
    const { dncEmails, dncDomains } = await fetchDncForBatch(supabase, contacts as Contact[], client_id);

    // ── OmniVerifier fast path ─────────────────────────────────────────────
    if (method === 'omni') {
      const toValidate = (contacts as Contact[]).filter(c => {
        const domain = c.email.split('@')[1]?.toLowerCase();
        return !dncEmails.has(c.email.toLowerCase()) && !(domain && dncDomains.has(domain));
      });

      stats.skipped_dnc = contacts.length - toValidate.length;

      // Process in chunks of 50 concurrent requests
      const CONCURRENCY = 50;
      const results: { contact: Contact; omni: OmniResult }[] = [];

      for (let i = 0; i < toValidate.length; i += CONCURRENCY) {
        const chunk = toValidate.slice(i, i + CONCURRENCY);
        const chunkResults = await Promise.allSettled(
          chunk.map(async (contact) => {
            const omni = await validateWithOmni(contact.email);
            return { contact, omni };
          })
        );
        for (const r of chunkResults) {
          if (r.status === 'fulfilled') results.push(r.value);
          else stats.errors++;
        }
      }

      // Batch update contacts
      const updates = results.map(({ contact, omni }) => {
        const isVerified = omni.valid;
        const status = omni.valid ? (omni.catchall ? 'catch_all' : 'verified') : 'invalid';
        stats.processed++;
        if (omni.valid && omni.catchall) stats.catch_all++;
        else if (omni.valid) stats.valid++;
        else stats.invalid++;

        return {
          id: contact.id,
          email_verified: isVerified,
          email_verified_at: isVerified ? new Date().toISOString() : null,
          email_waterfall_status: status,
          email_catchall: omni.catchall,
        };
      });

      if (!dry_run && updates.length > 0) {
        // Upsert in batches of 100 to avoid query size limits
        for (let i = 0; i < updates.length; i += 100) {
          const batch = updates.slice(i, i + 100);
          for (const u of batch) {
            await supabase.from('contacts').update({
              email_verified: u.email_verified,
              email_verified_at: u.email_verified_at,
              email_waterfall_status: u.email_waterfall_status,
              email_catchall: u.email_catchall,
            }).eq('id', u.id);
          }
        }

        // Log validation results
        const logs = results.map(({ contact, omni }) => ({
          contact_id: contact.id,
          sourcing_run_id: sourcing_run_id || null,
          omni_result: { result: omni.result, valid: omni.valid, catchall: omni.catchall },
          final_status: omni.valid ? 'valid' : 'invalid',
          final_method: 'omni',
        }));

        for (let i = 0; i < logs.length; i += 100) {
          await supabase.from('contact_validation_log').insert(logs.slice(i, i + 100));
        }

        // Trigger email-waterfall for invalid (not unknown — omni returns valid/invalid/catchall)
        const invalidContacts = results.filter(r => !r.omni.valid && r.omni.result !== 'skipped' && r.omni.result !== 'omni_error');
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        for (const { contact } of invalidContacts) {
          fetch(`${supabaseUrl}/functions/v1/email-waterfall`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ contact_id: contact.id, sourcing_run_id, force_search: true }),
          }).catch(() => {});
        }
      }
    } else {
      // ── Enrow path (original) ────────────────────────────────────────────
      for (const contact of contacts as Contact[]) {
        const contactDomain = contact.email.split('@')[1]?.toLowerCase();
        if (dncEmails.has(contact.email.toLowerCase()) || (contactDomain && dncDomains.has(contactDomain))) {
          console.log(`Skipping DNC contact: ${contact.email}`);
          stats.skipped_dnc++;
          continue;
        }
        try {
          console.log(`Validating: ${contact.email}`);

          const enrowResult = await validateWithEnrow(contact.email);
          const isVerified = enrowResult.status === 'valid' || enrowResult.status === 'catch_all';

          const waterfallStatus = enrowResult.status === 'valid' ? 'verified'
            : enrowResult.status === 'catch_all' ? 'catch_all'
            : enrowResult.status === 'invalid' ? 'invalid'
            : 'unknown';

          stats[enrowResult.status]++;
          stats.processed++;

          if (!dry_run) {
            await supabase.from('contacts').update({
              email_verified: isVerified,
              email_verified_at: isVerified ? new Date().toISOString() : null,
              email_waterfall_status: waterfallStatus,
              email_catchall: enrowResult.status === 'catch_all',
            }).eq('id', contact.id);

            await supabase.from('contact_validation_log').insert({
              contact_id: contact.id,
              sourcing_run_id: sourcing_run_id || null,
              enrow_result: enrowResult.raw_response || { status: enrowResult.status, confidence: enrowResult.confidence },
              final_status: isVerified ? 'valid' : enrowResult.status === 'invalid' ? 'invalid' : 'unknown',
              final_method: 'enrow',
            });

            if (enrowResult.status === 'invalid' || enrowResult.status === 'unknown') {
              const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
              const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
              fetch(`${supabaseUrl}/functions/v1/email-waterfall`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${serviceKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ contact_id: contact.id, sourcing_run_id, force_search: true }),
              }).catch(() => {});
            }
          }

          await new Promise(r => setTimeout(r, 200));
        } catch (error) {
          console.error(`Error processing contact ${contact.id}:`, error);
          stats.errors++;
        }
      }
    }

    // Log to sync_log
    const completedAt = new Date();
    await supabase.from('sync_log').insert({
      source: method === 'omni' ? 'validate_leads_omni' : 'validate_leads_enrow',
      table_name: 'contacts',
      operation: dry_run ? 'dry_run' : 'validate',
      records_processed: stats.processed,
      records_created: stats.valid + stats.catch_all,
      records_failed: stats.invalid + stats.errors,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
      metadata: { ...stats, method },
    });

    return new Response(
      JSON.stringify({ success: true, dry_run, method, stats }),
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
