import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Find Contacts — A-Leads API contact finder
 *
 * Input:
 *   {
 *     company_id?: string,
 *     company_ids?: string[],
 *     max_results?: number,
 *     client_id?: string,
 *     cell_id?: string
 *   }
 * Output: { companies_processed: number, contacts_found: number, contacts_created: number, leads_created: number }
 */

const ALEADS_API_KEY = Deno.env.get('ALEADS_API_KEY');
const ALEADS_BASE_URL = 'https://api.a-leads.co/v1';

interface ALeadsContact {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  linkedin_url?: string;
  title?: string;
  seniority?: string;
  department?: string;
  confidence_score?: number;
}

// Search contacts via A-Leads API
async function searchContacts(domain: string, companyName: string, maxResults: number = 3): Promise<ALeadsContact[]> {
  try {
    const response = await fetch(`${ALEADS_BASE_URL}/contacts/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ALEADS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        domain,
        company_name: companyName,
        per_page: maxResults,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.log('A-Leads rate limited, waiting...');
        await new Promise(r => setTimeout(r, 1000));
        return searchContacts(domain, companyName, maxResults);
      }
      throw new Error(`A-Leads API error: ${response.status}`);
    }

    const data = await response.json();
    return data.contacts || [];
  } catch (error) {
    console.error('A-Leads search failed:', error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      company_id,
      company_ids,
      max_results = 3,
      client_id,
      cell_id,
    } = body;

    const targetCompanyIds: string[] = company_ids || (company_id ? [company_id] : []);

    if (targetCompanyIds.length === 0) {
      return new Response(
        JSON.stringify({ error: 'company_id or company_ids is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Haal companies op
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('id, name, domain')
      .in('id', targetCompanyIds);

    if (companiesError || !companies) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch companies' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let totalContactsFound = 0;
    let totalContactsCreated = 0;
    let totalLeadsCreated = 0;
    const processedCompanies: string[] = [];
    const createdContactIds: string[] = [];

    for (const company of companies) {
      if (!company.domain) continue;
      processedCompanies.push(company.id);

      // Check of we al contacts hebben voor deze business
      const { data: existingContacts } = await supabase
        .from('contacts')
        .select('id, email, linkedin_url')
        .eq('source_id', company.id);

      const contacts = await searchContacts(company.domain, company.name, max_results);
      totalContactsFound += contacts.length;

      for (const contact of contacts) {
        // Check of contact al bestaat (op LinkedIn URL of email)
        const duplicate = (existingContacts ?? []).find((ec: any) =>
          (contact.linkedin_url && ec.linkedin_url === contact.linkedin_url) ||
          (contact.email && ec.email === contact.email)
        );

        if (duplicate) {
          // Link existing contact to cell if needed
          if (cell_id && client_id) {
            const { error: leadErr } = await supabase
              .from('leads')
              .upsert({
                contact_id: duplicate.id,
                client_id,
                cell_id,
                status: 'sourced',
                added_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }, { onConflict: 'contact_id,cell_id' });
            if (!leadErr) totalLeadsCreated++;
          }
          continue;
        }

        // Maak contact aan
        const { data: newContact, error: insertError } = await supabase
          .from('contacts')
          .insert({
            company_id: company.id,
            client_id: client_id || null,
            first_name: contact.first_name,
            last_name: contact.last_name,
            email: contact.email || null,
            email_verified: false,
            linkedin_url: contact.linkedin_url || null,
            title: contact.title || null,
            department: contact.seniority || null,
            source: 'a-leads',
            source_id: company.id,
            email_waterfall_status: contact.email ? 'existing' : 'pending',
            enrichment_data: {
              confidence_score: contact.confidence_score,
              seniority: contact.seniority,
              department: contact.department,
              source: 'a-leads',
              found_at: new Date().toISOString(),
            }
          })
          .select('id')
          .single();

        if (!insertError && newContact) {
          totalContactsCreated++;
          createdContactIds.push(newContact.id);

          // Maak lead record aan voor cell-koppeling
          if (cell_id && client_id) {
            const { error: leadErr } = await supabase
              .from('leads')
              .insert({
                contact_id: newContact.id,
                client_id,
                cell_id,
                status: 'sourced',
                added_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            if (!leadErr) totalLeadsCreated++;
          }
        }
      }

      // Rate limiting tussen companies
      if (companies.length > 1) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // Update business: laatste enrichment timestamp
    if (processedCompanies.length > 0) {
      await supabase
        .from('companies')
        .update({ last_enriched_at: new Date().toISOString() })
        .in('id', processedCompanies);
    }

    return new Response(
      JSON.stringify({
        companies_processed: processedCompanies.length,
        contacts_found: totalContactsFound,
        contacts_created: totalContactsCreated,
        leads_created: totalLeadsCreated,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Find contacts error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
