/**
 * EmailBison Pusher — directe logica, geen HTTP hop naar edge function
 * Port van supabase/functions/emailbison-pusher/index.ts naar Bun/Railway
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EB_API_KEY = process.env.EMAIL_BISON_API_KEY ?? '';
const EB_BASE_URL = 'https://mail.scaleyourleads.com/api';

export interface PusherOptions {
  client_id: string;
  emailbison_campaign_id: number;
  campaign_id?: string;
  cell_id?: string;
  sourcing_run_id?: string;
  dry_run?: boolean;
  batch_size?: number;
}

export interface PusherResult {
  pushed: number;
  dnc_suppressed: number;
  eb_campaign_id: number;
  dry_run?: boolean;
  would_push?: number;
  sample?: string[];
}

interface Contact {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_id: string | null;
  client_id: string | null;
  enrichment_data: Record<string, unknown> | null;
  custom_variables: Record<string, unknown> | null;
}

interface Company {
  id: string;
  name: string | null;
  domain: string | null;
}

// ── EmailBison API ────────────────────────────────────────────────────────────

async function ebCreateLeads(
  leadData: Record<string, unknown>[]
): Promise<{ success: boolean; lead_ids: number[]; error?: string }> {
  try {
    const response = await fetch(`${EB_BASE_URL}/leads/create-or-update/multiple`, {
      method: 'POST',
      headers: { 'api-key': EB_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_data: leadData, existing_lead_behavior: 'patch' }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`EB leads create error: ${response.status} — ${text}`);
    }
    const data = await response.json() as { leads?: Record<string, unknown>[]; data?: Record<string, unknown>[] };
    const leadIds = (data.leads || data.data || []).map(l => Number(l.id));
    return { success: true, lead_ids: leadIds };
  } catch (err) {
    return { success: false, lead_ids: [], error: (err as Error).message };
  }
}

async function ebAttachLeads(
  campaignId: number,
  leadIds: number[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${EB_BASE_URL}/campaigns/${campaignId}/leads/attach-leads`, {
      method: 'POST',
      headers: { 'api-key': EB_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ allow_parallel_sending: false, lead_ids: leadIds }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`EB attach leads error: ${response.status} — ${text}`);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function runPusher(opts: PusherOptions): Promise<PusherResult> {
  const {
    client_id,
    emailbison_campaign_id,
    campaign_id,
    cell_id,
    sourcing_run_id,
    dry_run = false,
    batch_size = 500,
  } = opts;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const now = new Date().toISOString();

  // 1. Optioneel: contacten filteren op cell_id via leads
  let contactIds: string[] | null = null;
  if (cell_id) {
    const { data: cellLeads } = await supabase
      .from('leads')
      .select('contact_id')
      .eq('cell_id', cell_id)
      .eq('client_id', client_id);
    contactIds = (cellLeads ?? []).map(r => r.contact_id).filter(Boolean);
    if (contactIds.length === 0) {
      console.log('[pusher] Geen leads gevonden voor cell_id — stop');
      return { pushed: 0, dnc_suppressed: 0, eb_campaign_id: emailbison_campaign_id };
    }
  }

  // 2. Haal validated contacts op
  let contactQuery = supabase
    .from('contacts')
    .select('id, email, first_name, last_name, company_id, client_id, enrichment_data, custom_variables')
    .eq('email_verified', true)
    .not('email', 'is', null)
    .not('first_name', 'is', null)
    .limit(batch_size);

  if (contactIds) {
    contactQuery = contactQuery.in('id', contactIds);
  } else {
    contactQuery = contactQuery.eq('client_id', client_id);
  }

  const { data: contacts, error: contactsError } = await contactQuery;
  if (contactsError) throw new Error(`Fetch contacts failed: ${contactsError.message}`);
  if (!contacts || contacts.length === 0) {
    console.log('[pusher] Geen validated contacts om te pushen');
    return { pushed: 0, dnc_suppressed: 0, eb_campaign_id: emailbison_campaign_id };
  }

  // 3. DNC filter
  const { data: suppressedRows } = await supabase
    .from('dnc_entities')
    .select('entity_type, entity_value')
    .or(`client_id.is.null,client_id.eq.${client_id}`)
    .in('entity_type', ['email', 'domain', 'contact_id'])
    .or(`expires_at.is.null,expires_at.gt.${now}`);

  const suppressedEmails = new Set<string>();
  const suppressedDomains = new Set<string>();
  const suppressedContacts = new Set<string>();
  for (const row of suppressedRows ?? []) {
    if (row.entity_type === 'email') suppressedEmails.add(row.entity_value.toLowerCase());
    if (row.entity_type === 'domain') suppressedDomains.add(row.entity_value.toLowerCase());
    if (row.entity_type === 'contact_id') suppressedContacts.add(row.entity_value);
  }

  // 4. Company namen ophalen
  const companyIds = [...new Set((contacts as Contact[]).map(c => c.company_id).filter(Boolean))] as string[];
  const companyMap = new Map<string, Company>();
  if (companyIds.length > 0) {
    const { data: companies } = await supabase.from('companies').select('id, name, domain').in('id', companyIds);
    for (const company of companies ?? []) companyMap.set(company.id, company);
  }

  // 5. DNC filter toepassen
  const toProcess: Contact[] = [];
  const skippedDnc: string[] = [];
  for (const contact of contacts as Contact[]) {
    const emailLower = contact.email.toLowerCase();
    const domain = emailLower.split('@')[1] ?? '';
    if (suppressedContacts.has(contact.id) || suppressedEmails.has(emailLower) || suppressedDomains.has(domain)) {
      skippedDnc.push(contact.email);
      continue;
    }
    toProcess.push(contact);
  }

  console.log(`[pusher] ${toProcess.length} te pushen, ${skippedDnc.length} DNC suppressed`);

  if (dry_run) {
    return {
      pushed: 0,
      dnc_suppressed: skippedDnc.length,
      eb_campaign_id: emailbison_campaign_id,
      dry_run: true,
      would_push: toProcess.length,
      sample: toProcess.slice(0, 5).map(c => c.email),
    };
  }

  if (toProcess.length === 0) {
    return { pushed: 0, dnc_suppressed: skippedDnc.length, eb_campaign_id: emailbison_campaign_id };
  }

  // 6. Stap 1: bulk create in EmailBison
  const leadData = toProcess.map(contact => {
    const company = contact.company_id ? companyMap.get(contact.company_id) : null;
    const enrichment = contact.enrichment_data || {};
    const customVars = contact.custom_variables || {};
    const safeCustomVars = Object.fromEntries(
      Object.entries(customVars).filter(([, v]) => v != null && v !== '')
    );
    return {
      email: contact.email,
      first_name: contact.first_name || '',
      last_name: contact.last_name || '',
      company_name: company?.name || (enrichment.company_name as string) || '',
      website: company?.domain ? `https://${company.domain}` : '',
      ...safeCustomVars,
    };
  });

  const createResult = await ebCreateLeads(leadData);
  if (!createResult.success || createResult.lead_ids.length === 0) {
    throw new Error(`EB create leads failed: ${createResult.error}`);
  }
  console.log(`[pusher] EB leads aangemaakt: ${createResult.lead_ids.length}`);

  // 7. Stap 2: attach aan campaign
  const attachResult = await ebAttachLeads(emailbison_campaign_id, createResult.lead_ids);
  if (!attachResult.success) throw new Error(`EB attach leads failed: ${attachResult.error}`);
  console.log(`[pusher] EB leads gekoppeld aan campaign ${emailbison_campaign_id}`);

  // 8. Insert in leads tabel
  if (campaign_id) {
    const leadsInsert = toProcess.map(contact => ({
      contact_id: contact.id,
      campaign_id,
      client_id,
      cell_id: cell_id ?? null,
      status: 'added',
      added_at: now,
      updated_at: now,
    }));
    const { error: leadsError } = await supabase
      .from('leads')
      .upsert(leadsInsert, { onConflict: 'contact_id,campaign_id' });
    if (leadsError) console.error('[pusher] leads insert warning:', leadsError.message);
  }

  // 9. Update sourcing_run
  if (sourcing_run_id) {
    await supabase
      .from('sourcing_runs')
      .update({ contacts_pushed: toProcess.length, contacts_suppressed: skippedDnc.length, updated_at: now })
      .eq('id', sourcing_run_id);
  }

  return {
    pushed: toProcess.length,
    dnc_suppressed: skippedDnc.length,
    eb_campaign_id: emailbison_campaign_id,
  };
}
