import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Email Waterfall — Multi-step email verification
 *
 * Flow:
 *   1. 90-day cache check (email_verified_at within 90 days → return cached)
 *   2. DNC check (Level 1: global bounces, Level 2: client-specific,
 *                 Level 3: positive reactions = replied/meeting_booked)
 *   3. If contact already has email → OmniVerifier confirm + catchall → return
 *   4. Pattern generation + TryKitt verify (cheap)
 *   5. First valid pattern → OmniVerifier confirm + catchall → return
 *   6. If all patterns fail → Enrow email find (name+domain lookup)
 *   7. Enrow result → OmniVerifier confirm + catchall → return
 *   8. Log to contact_validation_log
 *
 * Input:  { contact_id: string, client_id?: string, sourcing_run_id?: string }
 * Output: { email: string | null, source: string, catchall: boolean, cost: number }
 */

const TRYKITT_API_KEY = Deno.env.get('TRYKITT_API_KEY') ?? '';
const OMNIVERIFIER_API_KEY = Deno.env.get('OMNIVERIFIER_API_KEY') ?? '';
const ENROW_API_KEY = Deno.env.get('ENROW_API_KEY') ?? '';

const TRYKITT_BASE_URL = 'https://api.trykitt.com/v1';
const OMNIVERIFIER_BASE_URL = 'https://api.omniverifier.com/v1';
const ENROW_BASE_URL = 'https://api.enrow.io/v1';

const CACHE_DAYS = 90;
const DNC_POSITIVE_REASONS = ['replied', 'meeting_booked']

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Pattern helpers ──────────────────────────────────────────────────────────────

function generatePatterns(firstName: string, lastName: string, domain: string): string[] {
  const f = firstName.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  const l = lastName.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  const d = domain.toLowerCase().trim();
  if (!f || !l || !d) return [];
  return [
    `${f}@${d}`,
    `${f}.${l}@${d}`,
    `${f}${l}@${d}`,
    `${f[0]}${l}@${d}`,
    `${f[0]}.${l}@${d}`,
  ];
}

function extractDomainFromWebsite(website: string | null): string | null {
  if (!website) return null;
  try {
    const url = new URL(website.startsWith('http') ? website : `https://${website}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// ── TryKitt ──────────────────────────────────────────────────────────────────────

async function verifyWithTryKitt(email: string, retryCount = 0): Promise<{ valid: boolean; reason?: string }> {
  if (!TRYKITT_API_KEY) return { valid: false, reason: 'no_api_key' };
  try {
    const resp = await fetch(`${TRYKITT_BASE_URL}/verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TRYKITT_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (resp.status === 429 && retryCount < 3) {
      await new Promise(r => setTimeout(r, 1000));
      return verifyWithTryKitt(email, retryCount + 1);
    }
    if (!resp.ok) return { valid: false, reason: `trykitt_${resp.status}` };
    const data = await resp.json() as { status?: string; reason?: string };
    return { valid: data.status === 'valid' || data.status === 'risky', reason: data.reason };
  } catch {
    return { valid: false, reason: 'trykitt_error' };
  }
}

// ── OmniVerifier ─────────────────────────────────────────────────────────────────

interface OmniResult {
  valid: boolean;
  catchall: boolean;
  result: string;
}

async function verifyWithOmni(email: string): Promise<OmniResult> {
  if (!OMNIVERIFIER_API_KEY) return { valid: true, catchall: false, result: 'skipped' };
  try {
    const resp = await fetch(`${OMNIVERIFIER_BASE_URL}/validate`, {
      method: 'POST',
      headers: { 'x-api-key': OMNIVERIFIER_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!resp.ok) {
      console.warn(`OmniVerifier ${resp.status} for ${email} — treating as valid`);
      return { valid: true, catchall: false, result: `omni_${resp.status}` };
    }
    const data = await resp.json() as { result?: string; status?: string };
    const result = (data.result ?? data.status ?? '').toLowerCase();
    return {
      valid: result === 'valid' || result === 'catch-all' || result === 'catch_all',
      catchall: result === 'catch-all' || result === 'catch_all',
      result,
    };
  } catch {
    return { valid: true, catchall: false, result: 'omni_error' };
  }
}

// ── Enrow email find ──────────────────────────────────────────────────────────────

async function findEmailWithEnrow(
  firstName: string,
  lastName: string,
  domain: string
): Promise<string | null> {
  if (!ENROW_API_KEY) return null;
  try {
    const resp = await fetch(`${ENROW_BASE_URL}/find`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ENROW_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name: firstName, last_name: lastName, domain }),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { email?: string; data?: { email?: string } };
    return data.email ?? data.data?.email ?? null;
  } catch {
    return null;
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { contact_id, client_id, sourcing_run_id } = body as {
      contact_id: string;
      client_id?: string;
      sourcing_run_id?: string;
    };

    if (!contact_id) {
      return new Response(
        JSON.stringify({ error: 'contact_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Load contact
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, email_verified_at, company_id, enrichment_data')
      .eq('id', contact_id)
      .single();

    if (contactError || !contact) {
      return new Response(
        JSON.stringify({ error: 'Contact not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date();

    // 2. 90-day cache check — skip reverification if recently verified
    if (contact.email && contact.email_verified_at) {
      const verifiedAt = new Date(contact.email_verified_at);
      const ageDays = (now.getTime() - verifiedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays < CACHE_DAYS) {
        return new Response(
          JSON.stringify({ email: contact.email, source: 'cache', catchall: false, cost: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const nowIso = now.toISOString();

    // 3. DNC check — Level 1 (global), Level 2 (client), Level 3 (positive reactions)
    const dncQuery = supabase
      .from('dnc_entities')
      .select('entity_type, entity_value, reason, client_id')
      .or(`entity_type.eq.contact_id,entity_type.eq.email,entity_type.eq.domain`)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`);

    // Build OR for entity values
    const emailLower = contact.email?.toLowerCase();
    const entityValues = [contact_id, emailLower].filter(Boolean);
    if (entityValues.length > 0) {
      const { data: dncRows } = await dncQuery.in('entity_value', entityValues);

      for (const row of dncRows ?? []) {
        // Level 3: positive reactions are DNC for the specific client only
        const isLevel3 = DNC_POSITIVE_REASONS.includes(row.reason);
        const appliesToClient = row.client_id === null || row.client_id === client_id;

        if (!isLevel3 && appliesToClient) {
          return new Response(
            JSON.stringify({ email: null, source: 'dnc_suppressed', reason: row.reason, catchall: false, cost: 0 }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (isLevel3 && client_id && row.client_id === client_id) {
          return new Response(
            JSON.stringify({ email: null, source: 'dnc_positive', reason: row.reason, catchall: false, cost: 0 }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // 4. Load company domain
    const { data: company } = contact.company_id
      ? await supabase.from('companies').select('domain, website').eq('id', contact.company_id).single()
      : { data: null };

    const domain = company?.domain ?? extractDomainFromWebsite(company?.website ?? null);

    // 5. If contact already has email, run OmniVerifier confirm
    if (contact.email && domain) {
      const omni = await verifyWithOmni(contact.email);
      if (omni.valid) {
        await supabase.from('contacts').update({
          email_verified_at: nowIso,
          email_catchall: omni.catchall,
          email_waterfall_status: 'verified',
          email_verified: true,
        }).eq('id', contact_id);

        await logValidation(supabase, contact_id, sourcing_run_id, contact.email, 'omni_reconfirm', 'valid', {
          omni_result: omni.result,
        });

        return new Response(
          JSON.stringify({ email: contact.email, source: 'omni_reconfirm', catchall: omni.catchall, cost: 0.001 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      // Email failed OmniVerifier — clear it and try pattern generation below
      await supabase.from('contacts').update({
        email: null,
        email_verified: false,
        email_waterfall_status: 'invalidated',
        email_catchall: null,
      }).eq('id', contact_id);
    }

    if (!domain) {
      await supabase.from('contacts').update({
        email_verified: false, email_waterfall_status: 'failed',
      }).eq('id', contact_id);
      return new Response(
        JSON.stringify({ email: null, source: 'no_domain', catchall: false, cost: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const firstName = contact.first_name ?? '';
    const lastName = contact.last_name ?? '';

    // 6. TryKitt pattern verification
    const patterns = generatePatterns(firstName, lastName, domain);
    let foundEmail: string | null = null;
    let foundSource = '';
    let totalCost = 0;

    for (const pattern of patterns) {
      const trykitt = await verifyWithTryKitt(pattern);
      totalCost += 0.0015;
      if (trykitt.valid) {
        foundEmail = pattern;
        foundSource = 'trykitt';
        break;
      }
    }

    // 7. Enrow email find fallback (if TryKitt found nothing)
    if (!foundEmail && firstName && lastName) {
      const enrowEmail = await findEmailWithEnrow(firstName, lastName, domain);
      if (enrowEmail) {
        foundEmail = enrowEmail;
        foundSource = 'enrow_find';
        totalCost += 0.005;
      }
    }

    if (!foundEmail) {
      await supabase.from('contacts').update({
        email_verified: false, email_waterfall_status: 'failed',
      }).eq('id', contact_id);

      await logValidation(supabase, contact_id, sourcing_run_id, null, foundSource || 'failed', 'failed', {
        patterns_tried: patterns,
      });

      return new Response(
        JSON.stringify({ email: null, source: 'failed', catchall: false, cost: totalCost }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 8. OmniVerifier confirm on found email + catchall detection
    const omni = await verifyWithOmni(foundEmail);
    totalCost += 0.001;

    if (!omni.valid) {
      await supabase.from('contacts').update({
        email_verified: false, email_waterfall_status: 'failed',
      }).eq('id', contact_id);

      await logValidation(supabase, contact_id, sourcing_run_id, foundEmail, foundSource, 'failed', {
        omni_result: omni.result,
      });

      return new Response(
        JSON.stringify({ email: null, source: 'omni_rejected', catchall: false, cost: totalCost }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 9. DNC check for found email domain
    const foundDomain = foundEmail.split('@')[1]?.toLowerCase();
    if (foundDomain) {
      const { data: domainDnc } = await supabase
        .from('dnc_entities')
        .select('reason')
        .eq('entity_type', 'domain')
        .eq('entity_value', foundDomain)
        .or(`client_id.is.null,client_id.eq.${client_id ?? 'null'}`)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .maybeSingle();

      if (domainDnc) {
        await supabase.from('contacts').update({
          email_verified: false, email_waterfall_status: 'dnc_domain',
        }).eq('id', contact_id);
        return new Response(
          JSON.stringify({ email: null, source: 'dnc_domain', reason: domainDnc.reason, catchall: false, cost: totalCost }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 10. Save verified email
    await supabase.from('contacts').update({
      email: foundEmail,
      email_verified: true,
      email_verified_at: nowIso,
      email_catchall: omni.catchall,
      email_waterfall_status: 'verified',
    }).eq('id', contact_id);

    await logValidation(supabase, contact_id, sourcing_run_id, foundEmail, foundSource, 'valid', {
      omni_result: omni.result,
      catchall: omni.catchall,
    });

    return new Response(
      JSON.stringify({ email: foundEmail, source: foundSource, catchall: omni.catchall, cost: totalCost }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Email waterfall error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────────

async function logValidation(
  supabase: ReturnType<typeof createClient>,
  contactId: string,
  sourcingRunId: string | undefined,
  email: string | null,
  method: string,
  status: string,
  extra: Record<string, unknown>
): Promise<void> {
  await supabase.from('contact_validation_log').insert({
    contact_id: contactId,
    sourcing_run_id: sourcingRunId ?? null,
    final_status: status,
    final_method: method,
    trykitt_result: { email, ...extra },
  }).catch(err => console.error('log validation failed:', err.message));
}
