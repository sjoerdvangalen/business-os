/**
 * Email Waterfall Core — directe logica, geen HTTP hop naar edge function
 * Port van supabase/functions/email-waterfall/index.ts naar Bun/Railway
 */

import { createClient } from '@supabase/supabase-js';

const TRYKITT_API_KEY = process.env.TRYKITT_API_KEY ?? '';
const OMNIVERIFIER_API_KEY = process.env.OMNIVERIFIER_API_KEY ?? '';
const ENROW_API_KEY = process.env.ENROW_API_KEY ?? '';
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const TRYKITT_BASE_URL = 'https://api.trykitt.ai';
const OMNIVERIFIER_BASE_URL = 'https://api.omniverifier.com/v1/validate';
const ENROW_BASE_URL = 'https://api.enrow.io';
const ENROW_POLL_MS = 2000;
const ENROW_POLL_MAX = 15;
const CACHE_DAYS = 90;
const DNC_POSITIVE_REASONS = ['replied', 'meeting_booked'];
const RATE_ENROW_MS = 100;
const RATE_TRYKITT_MS = 250;
const RATE_OMNI_MS = 60;

export interface WaterfallResult {
  email: string | null;
  source: string;
  catchall: boolean;
  cost: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

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
  } catch { return null; }
}

// ── Enrow verify ──────────────────────────────────────────────────────────────

interface EnrowVerifyResult { valid: boolean; catchall: boolean; status: string; }

async function pollEnrow(jobId: string, endpoint: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < ENROW_POLL_MAX; i++) {
    await sleep(ENROW_POLL_MS);
    const res = await fetch(`${ENROW_BASE_URL}${endpoint}?id=${jobId}`, {
      headers: { 'x-api-key': ENROW_API_KEY },
    });
    if (!res.ok) continue;
    const data = await res.json() as Record<string, unknown>;
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
    const q = String(data.qualification || '').toLowerCase();
    return {
      valid: q === 'valid' || q === 'catchall' || q === 'catch_all',
      catchall: q === 'catchall' || q === 'catch_all',
      status: q || 'unknown',
    };
  } catch { return { valid: false, catchall: false, status: 'enrow_error' }; }
}

// ── TryKitt find ──────────────────────────────────────────────────────────────

async function findEmailWithTryKitt(
  firstName: string, lastName: string, domain: string, linkedinUrl?: string | null
): Promise<{ email: string | null; status: string }> {
  if (!TRYKITT_API_KEY) return { email: null, status: 'no_api_key' };
  try {
    const payload: Record<string, unknown> = { fullName: `${firstName} ${lastName}`.trim(), domain, realtime: true };
    if (linkedinUrl) payload.linkedinUrl = linkedinUrl;
    const resp = await fetch(`${TRYKITT_BASE_URL}/job/find_email`, {
      method: 'POST',
      headers: { 'x-api-key': TRYKITT_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (resp.status === 429) { await sleep(1000); return findEmailWithTryKitt(firstName, lastName, domain, linkedinUrl); }
    if (!resp.ok) return { email: null, status: `trykitt_${resp.status}` };
    const data = await resp.json() as { email?: string; validity?: string };
    const email = data.email && data.email.includes('@') ? data.email : null;
    return { email, status: data.validity ?? 'unknown' };
  } catch { return { email: null, status: 'trykitt_error' }; }
}

// ── Enrow find ────────────────────────────────────────────────────────────────

async function findEmailWithEnrow(
  firstName: string, lastName: string, domain: string, linkedinUrl?: string | null
): Promise<string | null> {
  if (!ENROW_API_KEY) return null;
  const fullName = `${firstName} ${lastName}`.trim();
  if (!fullName) return null;
  try {
    const payload: Record<string, unknown> = { fullname: fullName, company_domain: domain };
    if (linkedinUrl) payload.linkedin_url = linkedinUrl;
    const resp = await fetch(`${ENROW_BASE_URL}/email/find/single`, {
      method: 'POST',
      headers: { 'x-api-key': ENROW_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) return null;
    const init = await resp.json() as { id?: string };
    if (!init.id) return null;
    const data = await pollEnrow(init.id, '/email/find/single');
    return (data.email as string) || null;
  } catch { return null; }
}

// ── Omni verify ───────────────────────────────────────────────────────────────

interface OmniResult { valid: boolean; catchall: boolean; result: string; }

async function verifyWithOmni(email: string): Promise<OmniResult> {
  if (!OMNIVERIFIER_API_KEY) return { valid: true, catchall: false, result: 'skipped' };
  try {
    const resp = await fetch(`${OMNIVERIFIER_BASE_URL}/email/check`, {
      method: 'POST',
      headers: { 'x-api-key': OMNIVERIFIER_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!resp.ok) return { valid: true, catchall: false, result: `omni_${resp.status}` };
    const data = await resp.json() as { status?: string };
    const result = (data.status ?? '').toLowerCase();
    return {
      valid: result === 'valid' || result === 'deliverable' || result === 'catch-all',
      catchall: result === 'catch-all',
      result,
    };
  } catch { return { valid: true, catchall: false, result: 'omni_error' }; }
}

// ── Main: waterfall voor één contact ─────────────────────────────────────────

export async function waterfallContact(
  contactId: string,
  clientId?: string,
  sourcingRunId?: string,
): Promise<WaterfallResult> {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const now = new Date();
  const nowIso = now.toISOString();
  let totalCost = 0;

  // 1. Load contact
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, email, email_verified_at, company_id, linkedin_url')
    .eq('id', contactId)
    .single();

  if (contactError || !contact) return { email: null, source: 'not_found', catchall: false, cost: 0 };

  // 2. 90-day cache
  if (contact.email && contact.email_verified_at) {
    const ageDays = (now.getTime() - new Date(contact.email_verified_at).getTime()) / 86400000;
    if (ageDays < CACHE_DAYS) return { email: contact.email, source: 'cache', catchall: false, cost: 0 };
  }

  // 3. DNC check
  const emailLower = contact.email?.toLowerCase();
  const entityValues = [contactId, emailLower].filter(Boolean) as string[];
  if (entityValues.length > 0) {
    const { data: dncRows } = await supabase
      .from('dnc_entities')
      .select('entity_type, entity_value, reason, client_id')
      .or('entity_type.eq.contact_id,entity_type.eq.email')
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .in('entity_value', entityValues);

    for (const row of dncRows ?? []) {
      const isPositive = DNC_POSITIVE_REASONS.includes(row.reason);
      const appliesToClient = row.client_id === null || row.client_id === clientId;
      if (!isPositive && appliesToClient) return { email: null, source: 'dnc_suppressed', catchall: false, cost: 0 };
      if (isPositive && clientId && row.client_id === clientId) return { email: null, source: 'dnc_positive', catchall: false, cost: 0 };
    }
  }

  // 4. Load company domain
  const { data: company } = contact.company_id
    ? await supabase.from('companies').select('domain, website').eq('id', contact.company_id).single()
    : { data: null };

  const domain = company?.domain ?? extractDomainFromWebsite(company?.website ?? null);
  const firstName = contact.first_name ?? '';
  const lastName = contact.last_name ?? '';
  const linkedinUrl = contact.linkedin_url ?? null;

  // ── FASE 1: VIND EMAIL ────────────────────────────────────────────────────

  let foundEmail: string | null = contact.email ?? null;
  let foundSource = contact.email ? 'existing' : '';
  let omniResult: OmniResult | null = null;

  if (!foundEmail) {
    if (!domain) {
      await supabase.from('contacts').update({ email_verified: false, email_waterfall_status: 'failed' }).eq('id', contactId);
      return { email: null, source: 'no_domain', catchall: false, cost: 0 };
    }

    const tryCandidate = async (email: string, source: string): Promise<boolean> => {
      const omni = await verifyWithOmni(email);
      totalCost += 0.001;
      await sleep(RATE_OMNI_MS);
      if (omni.valid) { foundEmail = email; foundSource = source; omniResult = omni; return true; }
      return false;
    };

    // 4a. Enrow patterns
    const patterns = generatePatterns(firstName, lastName, domain);
    if (patterns.length > 0) {
      const results = await Promise.all(patterns.map(p => verifyWithEnrow(p)));
      const hitIndex = results.findIndex(r => r.valid);
      if (hitIndex !== -1) {
        const accepted = await tryCandidate(patterns[hitIndex], 'enrow_pattern');
        if (!accepted) { foundEmail = null; foundSource = ''; }
      }
    }

    // 4b. TryKitt
    if (!foundEmail && firstName && lastName) {
      await sleep(RATE_TRYKITT_MS);
      const trykitt = await findEmailWithTryKitt(firstName, lastName, domain, linkedinUrl);
      totalCost += 0.005;
      if (trykitt.email) {
        const accepted = await tryCandidate(trykitt.email, 'trykitt_find');
        if (!accepted) { foundEmail = null; foundSource = ''; }
      }
    }

    // 4c. Enrow find
    if (!foundEmail && firstName && lastName) {
      await sleep(RATE_ENROW_MS);
      const enrowEmail = await findEmailWithEnrow(firstName, lastName, domain, linkedinUrl);
      totalCost += 0.005;
      if (enrowEmail) await tryCandidate(enrowEmail, 'enrow_find');
    }
  }

  if (!foundEmail) {
    await supabase.from('contacts').update({ email_verified: false, email_waterfall_status: 'failed' }).eq('id', contactId);
    await logValidation(supabase, contactId, sourcingRunId, null, 'failed', 'failed', {});
    return { email: null, source: 'failed', catchall: false, cost: totalCost };
  }

  // ── FASE 2: VALIDEER EMAIL ────────────────────────────────────────────────

  if (!omniResult) {
    omniResult = await verifyWithOmni(foundEmail);
    totalCost += 0.001;
    await sleep(RATE_OMNI_MS);
    if (!omniResult.valid) {
      await supabase.from('contacts').update({ email_verified: false, email_waterfall_status: 'omni_rejected' }).eq('id', contactId);
      await logValidation(supabase, contactId, sourcingRunId, foundEmail, foundSource, 'failed', { omni_result: omniResult.result });
      return { email: null, source: 'omni_rejected', catchall: false, cost: totalCost };
    }
  }

  // Catchall check
  let catchall = omniResult.catchall;
  if (!catchall) {
    const enrowCheck = await verifyWithEnrow(foundEmail);
    await sleep(RATE_ENROW_MS);
    if (enrowCheck.catchall) catchall = true;
  }

  // DNC domain check
  const foundDomain = foundEmail.split('@')[1]?.toLowerCase();
  if (foundDomain) {
    const { data: domainDnc } = await supabase
      .from('dnc_entities')
      .select('reason')
      .eq('entity_type', 'domain')
      .eq('entity_value', foundDomain)
      .or(`client_id.is.null,client_id.eq.${clientId ?? 'null'}`)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .maybeSingle();

    if (domainDnc) {
      await supabase.from('contacts').update({ email_verified: false, email_waterfall_status: 'dnc_domain' }).eq('id', contactId);
      return { email: null, source: 'dnc_domain', catchall: false, cost: totalCost };
    }
  }

  // Opslaan
  await replaceContactEmail(supabase, contactId, foundEmail, nowIso, catchall, foundSource);
  await logValidation(supabase, contactId, sourcingRunId, foundEmail, foundSource, 'valid', {
    omni_result: omniResult.result, catchall,
  });

  return { email: foundEmail, source: foundSource, catchall, cost: totalCost };
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function logValidation(
  supabase: ReturnType<typeof createClient>,
  contactId: string,
  sourcingRunId: string | undefined,
  email: string | null,
  method: string,
  status: string,
  extra: Record<string, unknown>,
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

async function replaceContactEmail(
  supabase: ReturnType<typeof createClient>,
  contactId: string,
  newEmail: string,
  nowIso: string,
  catchall: boolean,
  source: string,
): Promise<void> {
  const { data: contact } = await supabase.from('contacts').select('email, history').eq('id', contactId).single();
  const oldEmail = contact?.email || null;
  const history = Array.isArray(contact?.history) ? contact.history as unknown[] : [];

  if (oldEmail && oldEmail.toLowerCase() !== newEmail.toLowerCase()) {
    history.push({
      at: nowIso, source: 'email_waterfall', changed_by: 'batch-worker',
      fields: { email: { from: oldEmail, to: newEmail } },
      note: `Replaced via ${source}`,
    });
  }

  await supabase.from('contacts').update({
    email: newEmail,
    email_verified: true,
    email_verified_at: nowIso,
    email_catchall: catchall,
    email_waterfall_status: 'verified',
    history,
  }).eq('id', contactId);
}
