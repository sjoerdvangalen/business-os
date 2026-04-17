import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * EmailBison Pusher — Push validated contacts naar een EmailBison campaign
 *
 * Flow:
 *   1. Fetch contacts (email_verified=true, voor gegeven client/campaign)
 *   2. DNC filter (global + client-scoped, niet-verlopen)
 *   3. Stap 1: POST /api/leads/multiple → lead_ids
 *   4. Stap 2: POST /api/campaigns/{id}/leads/attach-leads
 *   5. Insert/update leads tabel (contact × campaign × client)
 *   6. Update sourcing_runs teller
 *
 * Input:
 *   {
 *     client_id: string,
 *     emailbison_campaign_id: number,   // EB's numeric campaign id
 *     campaign_id?: string,             // Supabase campaigns.id (optional, voor leads insert)
 *     cell_id?: string,                 // campaign_cells.id — filter contacts by cell + tag leads
 *     sourcing_run_id?: string,
 *     dry_run?: boolean,
 *     batch_size?: number
 *   }
 */

const EB_API_KEY = Deno.env.get('EMAIL_BISON_API_KEY') ?? '';
const EB_BASE_URL = 'https://mail.scaleyourleads.com/api';

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

// EmailBison: bulk create leads (stap 1)
async function ebCreateLeads(
  leadData: Record<string, unknown>[]
): Promise<{ success: boolean; lead_ids: number[]; error?: string }> {
  try {
    const response = await fetch(`${EB_BASE_URL}/leads/create-or-update/multiple`, {
      method: 'POST',
      headers: {
        'api-key': EB_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lead_data: leadData,
        existing_lead_behavior: 'patch',
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`EB leads create error: ${response.status} — ${text}`);
    }

    const data = await response.json();
    const leadIds: number[] = (data.leads || data.data || []).map((l: Record<string, unknown>) => Number(l.id));

    return { success: true, lead_ids: leadIds };
  } catch (error) {
    return { success: false, lead_ids: [], error: (error as Error).message };
  }
}

// EmailBison: attach leads to campaign (stap 2)
async function ebAttachLeads(
  campaignId: number,
  leadIds: number[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${EB_BASE_URL}/campaigns/${campaignId}/leads/attach-leads`, {
      method: 'POST',
      headers: {
        'api-key': EB_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        allow_parallel_sending: false,
        lead_ids: leadIds,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`EB attach leads error: ${response.status} — ${text}`);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      client_id,
      emailbison_campaign_id,
      campaign_id,
      cell_id,
      sourcing_run_id,
      dry_run = false,
      batch_size = 500,
    } = body;

    if (!client_id || !emailbison_campaign_id) {
      return new Response(
        JSON.stringify({ error: 'client_id and emailbison_campaign_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Fetch validated contacts voor deze client
    // If cell_id provided: only contacts linked to that cell via leads
    let contactIds: string[] | null = null;
    if (cell_id) {
      const { data: cellLeads } = await supabase
        .from('leads')
        .select('contact_id')
        .eq('cell_id', cell_id)
        .eq('client_id', client_id);
      contactIds = (cellLeads ?? []).map(r => r.contact_id).filter(Boolean);
      if (contactIds.length === 0) {
        return new Response(
          JSON.stringify({ message: 'No leads linked to this cell', pushed: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

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
      return new Response(
        JSON.stringify({ message: 'No validated contacts to push', pushed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. DNC filter — haal alle actieve suppressions op (global + client)
    const now = new Date().toISOString();
    const { data: suppressedRows } = await supabase
      .from('dnc_entities')
      .select('entity_type, entity_value')
      .or(`client_id.is.null,client_id.eq.${client_id}`)
      .in('entity_type', ['email', 'domain', 'contact_id'])
      .or(`expires_at.is.null,expires_at.gt.${now}`);

    const suppressedEmails = new Set<string>();
    const suppressedDomains = new Set<string>();
    const suppressedContacts = new Set<string>();

    for (const row of suppressedRows || []) {
      if (row.entity_type === 'email') suppressedEmails.add(row.entity_value.toLowerCase());
      if (row.entity_type === 'domain') suppressedDomains.add(row.entity_value.toLowerCase());
      if (row.entity_type === 'contact_id') suppressedContacts.add(row.entity_value);
    }

    // 3. Haal company names op voor de contacts
    const companyIds = [...new Set(contacts.map(c => c.company_id).filter(Boolean))];
    const companyMap = new Map<string, Company>();

    if (companyIds.length > 0) {
      const { data: companies } = await supabase
        .from('companies')
        .select('id, name, domain')
        .in('id', companyIds);
      for (const company of companies || []) {
        companyMap.set(company.id, company);
      }
    }

    // 4. Filter DNC + bouw EB lead payloads
    const toProcess: Contact[] = [];
    const skippedDnc: string[] = [];

    for (const contact of contacts as Contact[]) {
      const emailLower = contact.email.toLowerCase();
      const domain = emailLower.split('@')[1] ?? '';

      if (
        suppressedContacts.has(contact.id) ||
        suppressedEmails.has(emailLower) ||
        suppressedDomains.has(domain)
      ) {
        skippedDnc.push(contact.email);
        continue;
      }
      toProcess.push(contact);
    }

    console.log(`EmailBison pusher: ${toProcess.length} to push, ${skippedDnc.length} DNC suppressed`);

    if (dry_run) {
      return new Response(
        JSON.stringify({
          dry_run: true,
          would_push: toProcess.length,
          dnc_suppressed: skippedDnc.length,
          sample: toProcess.slice(0, 5).map(c => c.email),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (toProcess.length === 0) {
      return new Response(
        JSON.stringify({ pushed: 0, dnc_suppressed: skippedDnc.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Stap 1: bulk create in EmailBison
    const leadData = toProcess.map(contact => {
      const company = contact.company_id ? companyMap.get(contact.company_id) : null;
      const enrichment = contact.enrichment_data || {};
      const customVars = contact.custom_variables || {};

      // Filter: alleen non-null, non-empty values — voorkomt errors bij EB
      const safeCustomVars = Object.fromEntries(
        Object.entries(customVars).filter(([_, v]) => v != null && v !== '')
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

    console.log(`EB leads created: ${createResult.lead_ids.length} ids`);

    // 6. Stap 2: attach leads aan campaign
    const attachResult = await ebAttachLeads(Number(emailbison_campaign_id), createResult.lead_ids);
    if (!attachResult.success) {
      throw new Error(`EB attach leads failed: ${attachResult.error}`);
    }

    console.log(`EB leads attached to campaign ${emailbison_campaign_id}`);

    // 7. Insert in leads tabel (contact × campaign × client)
    if (campaign_id) {
      const leadsInsert = toProcess.map(contact => ({
        contact_id: contact.id,
        campaign_id,
        client_id,
        cell_id: cell_id ?? null,
        status: 'added',
        added_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const { error: leadsError } = await supabase
        .from('leads')
        .upsert(leadsInsert, { onConflict: 'contact_id,campaign_id' });

      if (leadsError) {
        console.error('leads insert warning:', leadsError.message);
      }
    }

    // 8. Update sourcing_run counter
    if (sourcing_run_id) {
      await supabase
        .from('sourcing_runs')
        .update({
          contacts_pushed: toProcess.length,
          contacts_suppressed: skippedDnc.length,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sourcing_run_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        pushed: toProcess.length,
        dnc_suppressed: skippedDnc.length,
        eb_campaign_id: emailbison_campaign_id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('EmailBison pusher error:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
