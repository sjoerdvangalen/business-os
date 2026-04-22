import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Email Waterfall — Find then validate, één run
 *
 * Flow:
 *   1. 90-day cache check
 *   2. DNC check (contact_id + email — global, client, positief)
 *   3. Vind email (één van de volgende, in volgorde):
 *      a. Bestaand email op contact (uit CSV / vorige run)
 *      b. Enrow patterns (5 parallel, gratis bij not_found)
 *      c. TryKitt search (naam + domain)
 *      d. Enrow search (naam + domain)
 *   4. Omni verify op gevonden email
 *   5. Enrow catchall check
 *   6. DNC domain check
 *   7. Opslaan + log naar contact_validation_log
 *
 * Input:  { contact_id: string, client_id?: string, sourcing_run_id?: string }
 * Output: { email: string | null, source: string, catchall: boolean, cost: number }
 */

const TRYKITT_API_KEY = Deno.env.get('TRYKITT_API_KEY') ?? '';
const OMNIVERIFIER_API_KEY = Deno.env.get('OMNIVERIFIER_API_KEY') ?? '';
const ENROW_API_KEY = Deno.env.get('ENROW_API_KEY') ?? '';

const TRYKITT_BASE_URL = 'https://api.trykitt.com/v1';
const OMNIVERIFIER_BASE_URL = 'https://api.omniverifier.com/v1/validate';
const ENROW_BASE_URL = 'https://api.enrow.io';
const ENROW_POLL_MS = 2000;
const ENROW_POLL_MAX = 15;

const CACHE_DAYS = 90;
const DNC_POSITIVE_REASONS = ['replied', 'meeting_booked'];

// Rate limits (safe delays in ms)
const RATE_ENROW_MS = 100;
const RATE_TRYKITT_MS = 250;
const RATE_OMNI_MS = 60;

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

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Enrow verify ─────────────────────────────────────────────────────────────────

interface EnrowVerifyResult {
  valid: boolean;
  catchall: boolean;
  status: string;
}

async function pollEnrow(jobId: string, endpoint: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < ENROW_POLL_MAX; i++) {
    await sleep(ENROW_POLL_MS);
    const res = await fetch(`${ENROW_BASE_URL}${endpoint}?id=${jobId}`, {
      headers: { 'x-api-key': ENROW_API_KEY },
    });
    if (!res.ok) continue;
    const data = await res.json() as Record<string, unknown>;
    // Enrow returns { message: "operating" } while processing — only return when qualification or email is present
    if (data.qualification || data.email) return data;
  }
  return { status: 'timeout' };
}

async function verifyWithEnrow(email: string): Promise<EnrowVerifyResult> {
  if (!ENROW_API_KEY) return { valid: false, catchall: false, status: 'no_api_key' };
  try {
    const resp = await fetch(`${ENROW_BASE_URL}/email/verify/single`, {
      method: 'POST',
      headers: { 'x-api-key': ENROW_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!resp.ok) return { valid: false, catchall: false, status: `enrow_${resp.status}` };
    const init = await resp.json() as { id?: string };
    if (!init.id) return { valid: false, catchall: false, status: 'enrow_no_job' };
    const data = await pollEnrow(init.id, '/email/verify/single');
    const qualification = String(data.qualification || '').toLowerCase();
    const valid = qualification === 'valid' || qualification === 'catchall' || qualification === 'catch_all';
    const catchall = qualification === 'catchall' || qualification === 'catch_all';
    return { valid, catchall, status: qualification || 'unknown' };
  } catch {
    return { valid: false, catchall: false, status: 'enrow_error' };
  }
}

// ── TryKitt search ───────────────────────────────────────────────────────────────

interface TryKittFindResult {
  email: string | null;
  status: string;
}

async function findEmailWithTryKitt(
  firstName: string,
  lastName: string,
  domain: string
): Promise<TryKittFindResult> {
  if (!TRYKITT_API_KEY) return { email: null, status: 'no_api_key' };
  try {
    const resp = await fetch(`${TRYKITT_BASE_URL}/find`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TRYKITT_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name: firstName, last_name: lastName, domain }),
    });
    if (resp.status === 429) {
      await sleep(1000);
      return findEmailWithTryKitt(firstName, lastName, domain);
    }
    if (!resp.ok) return { email: null, status: `trykitt_${resp.status}` };
    const data = await resp.json() as { email?: string; status?: string };
    return { email: data.email ?? null, status: data.status ?? 'found' };
  } catch {
    return { email: null, status: 'trykitt_error' };
  }
}

// ── Enrow search ─────────────────────────────────────────────────────────────────

async function findEmailWithEnrow(
  firstName: string,
  lastName: string,
  domain: string
): Promise<string | null> {
  if (!ENROW_API_KEY) return null;
  const fullName = `${firstName} ${lastName}`.trim();
  if (!fullName) return null;
  try {
    const resp = await fetch(`${ENROW_BASE_URL}/email/find/single`, {
      method: 'POST',
      headers: { 'x-api-key': ENROW_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullname: fullName, company_domain: domain }),
    });
    if (!resp.ok) return null;
    const init = await resp.json() as { id?: string };
    if (!init.id) return null;
    const data = await pollEnrow(init.id, '/email/find/single');
    return (data.email as string) || null;
  } catch {
    return null;
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
    const resp = await fetch(`${OMNIVERIFIER_BASE_URL}/email/check`, {
      method: 'POST',
      headers: { 'x-api-key': OMNIVERIFIER_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!resp.ok) {
      console.warn(`OmniVerifier ${resp.status} for ${email} — treating as valid`);
      return { valid: true, catchall: false, result: `omni_${resp.status}` };
    }
    const data = await resp.json() as { status?: string; mail_server?: string };
    const result = (data.status ?? '').toLowerCase();
    return {
      valid: result === 'valid' || result === 'deliverable' || result === 'catch-all',
      catchall: result === 'catch-all',
      result,
    };
  } catch {
    return { valid: true, catchall: false, result: 'omni_error' };
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { contact_id, client_id, sourcing_run_id, force_search } = body as {
      contact_id: string;
      client_id?: string;
      sourcing_run_id?: string;
      force_search?: boolean;
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
    const nowIso = now.toISOString();

    // 2. 90-day cache check
    if (contact.email && contact.email_verified_at && !force_search) {
      const ageDays = (now.getTime() - new Date(contact.email_verified_at).getTime()) / 86400000;
      if (ageDays < CACHE_DAYS) {
        return new Response(
          JSON.stringify({ email: contact.email, source: 'cache', catchall: false, cost: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 3. DNC check op contact_id + bestaand email
    const emailLower = contact.email?.toLowerCase();
    const entityValues = [contact_id, emailLower].filter(Boolean) as string[];
    if (entityValues.length > 0) {
      const { data: dncRows } = await supabase
        .from('dnc_entities')
        .select('entity_type, entity_value, reason, client_id')
        .or('entity_type.eq.contact_id,entity_type.eq.email')
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .in('entity_value', entityValues);

      for (const row of dncRows ?? []) {
        const isPositive = DNC_POSITIVE_REASONS.includes(row.reason);
        const appliesToClient = row.client_id === null || row.client_id === client_id;
        if (!isPositive && appliesToClient) {
          return new Response(
            JSON.stringify({ email: null, source: 'dnc_suppressed', reason: row.reason, catchall: false, cost: 0 }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (isPositive && client_id && row.client_id === client_id) {
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
    const firstName = contact.first_name ?? '';
    const lastName = contact.last_name ?? '';
    let totalCost = 0;

    // ── FASE 1: VIND EMAIL ──────────────────────────────────────────────────────────

    let foundEmail: string | null = contact.email ?? null;
    let foundSource = contact.email ? 'existing' : '';

    // Als geen email (of force_search), probeer te vinden via patronen + search
    if (!foundEmail || force_search) {
      foundEmail = null;
      foundSource = '';

      if (!domain) {
        await supabase.from('contacts').update({
          email_verified: false, email_waterfall_status: 'failed',
        }).eq('id', contact_id);
        return new Response(
          JSON.stringify({ email: null, source: 'no_domain', catchall: false, cost: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 4a. Enrow patterns (5 parallel — gratis bij not_found)
      const patterns = generatePatterns(firstName, lastName, domain);
      if (patterns.length > 0) {
        const results = await Promise.all(patterns.map(p => verifyWithEnrow(p)));
        const hitIndex = results.findIndex(r => r.valid);
        if (hitIndex !== -1) {
          foundEmail = patterns[hitIndex];
          foundSource = 'enrow_pattern';
        }
      }

      // 4b. TryKitt search
      if (!foundEmail && firstName && lastName) {
        await sleep(RATE_TRYKITT_MS);
        const trykitt = await findEmailWithTryKitt(firstName, lastName, domain);
        totalCost += 0.005;
        if (trykitt.email) {
          foundEmail = trykitt.email;
          foundSource = 'trykitt_find';
        }
      }

      // 4c. Enrow search
      if (!foundEmail && firstName && lastName) {
        await sleep(RATE_ENROW_MS);
        const enrowEmail = await findEmailWithEnrow(firstName, lastName, domain);
        totalCost += 0.005;
        if (enrowEmail) {
          foundEmail = enrowEmail;
          foundSource = 'enrow_find';
        }
      }
    }

    if (!foundEmail) {
      await supabase.from('contacts').update({
        email_verified: false, email_waterfall_status: 'failed',
      }).eq('id', contact_id);
      await logValidation(supabase, contact_id, sourcing_run_id, null, 'failed', 'failed', {});
      return new Response(
        JSON.stringify({ email: null, source: 'failed', catchall: false, cost: totalCost }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── FASE 2: VALIDEER EMAIL ──────────────────────────────────────────────────────

    // 5. Omni verify
    const omni = await verifyWithOmni(foundEmail);
    totalCost += 0.001;
    await sleep(RATE_OMNI_MS);

    if (!omni.valid) {
      await supabase.from('contacts').update({
        email_verified: false, email_waterfall_status: 'omni_rejected',
      }).eq('id', contact_id);
      await logValidation(supabase, contact_id, sourcing_run_id, foundEmail, foundSource, 'failed', {
        omni_result: omni.result,
      });
      return new Response(
        JSON.stringify({ email: null, source: 'omni_rejected', catchall: false, cost: totalCost }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Enrow catchall check (Omni zegt soms catch-all, Enrow is accurater)
    let catchall = omni.catchall;
    if (!catchall) {
      const enrowCheck = await verifyWithEnrow(foundEmail);
      await sleep(RATE_ENROW_MS);
      if (enrowCheck.catchall) catchall = true;
    }

    // 7. DNC check op gevonden email domain
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

    // 8. Opslaan
    await replaceContactEmail(supabase, contact_id, foundEmail, nowIso, catchall, foundSource);
    await logValidation(supabase, contact_id, sourcing_run_id, foundEmail, foundSource, 'valid', {
      omni_result: omni.result,
      catchall,
    });

    return new Response(
      JSON.stringify({ email: foundEmail, source: foundSource, catchall, cost: totalCost }),
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
  try {
    await supabase.from('contact_validation_log').insert({
      contact_id: contactId,
      sourcing_run_id: sourcingRunId ?? null,
      final_status: status,
      final_method: method,
      omni_result: { email, ...extra },
    });
  } catch (err) {
    console.error('log validation failed:', (err as Error).message);
  }
}

/**
 * Hard rule: newly found email ALWAYS replaces the old one and gets priority.
 * Logs the change to contacts.history for audit trail.
 */
async function replaceContactEmail(
  supabase: ReturnType<typeof createClient>,
  contactId: string,
  newEmail: string,
  nowIso: string,
  catchall: boolean,
  source: string,
): Promise<void> {
  // 1. Read old email + history
  const { data: contact } = await supabase
    .from('contacts')
    .select('email, history')
    .eq('id', contactId)
    .single();

  const oldEmail = contact?.email || null;
  const history = Array.isArray(contact?.history) ? contact.history as unknown[] : [];

  // 2. Append history entry if email actually changed
  if (oldEmail && oldEmail.toLowerCase() !== newEmail.toLowerCase()) {
    history.push({
      at: nowIso,
      source: 'email_waterfall',
      changed_by: 'email-waterfall',
      fields: {
        email: { from: oldEmail, to: newEmail },
      },
      note: `Replaced invalid/stale email with verified email via ${source}`,
    });
  }

  // 3. Update contact — new email is canonical, always takes priority
  await supabase.from('contacts').update({
    email: newEmail,
    email_verified: true,
    email_verified_at: nowIso,
    email_catchall: catchall,
    email_waterfall_status: 'verified',
    history,
  }).eq('id', contactId);
}
