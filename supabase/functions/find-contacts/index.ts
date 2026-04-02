import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Find Contacts — A-Leads API contact finder
 *
 * Input: { company_id: string, max_results?: number }
 * Output: { contacts_found: number, contacts: Contact[] }
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
    const { company_id, max_results = 3 } = await req.json();

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: 'company_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Init Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Haal business op
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', company_id)
      .single();

    if (companyError || !company) {
      return new Response(
        JSON.stringify({ error: 'Business not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!company.domain) {
      return new Response(
        JSON.stringify({ error: 'Company has no domain' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check of we al contacts hebben voor deze business
    const { data: existingContacts } = await supabase
      .from('contacts')
      .select('id')
      .eq('source_id', company_id)
      .limit(1);

    if (existingContacts && existingContacts.length > 0) {
      return new Response(
        JSON.stringify({ message: 'Contacts already exist for this company', skipped: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Zoek contacts via A-Leads
    const contacts = await searchContacts(company.domain, company.name, max_results);

    let created = 0;

    for (const contact of contacts) {
      // Check of contact al bestaat (op LinkedIn URL)
      if (contact.linkedin_url) {
        const { data: existing } = await supabase
          .from('contacts')
          .select('id')
          .eq('linkedin_url', contact.linkedin_url)
          .maybeSingle();

        if (existing) continue;
      }

      // Maak contact aan
      const { error: insertError } = await supabase
        .from('contacts')
        .insert({
          company_id: company.id,
          first_name: contact.first_name,
          last_name: contact.last_name,
          email: contact.email || null,
          email_verified: false,
          linkedin_url: contact.linkedin_url || null,
          title: contact.title || null,
          department: contact.seniority || null,
          source: 'a-leads',
          source_id: company_id,
          email_waterfall_status: contact.email ? 'existing' : 'pending',
          enrichment_data: {
            confidence_score: contact.confidence_score,
            seniority: contact.seniority,
            department: contact.department,
            source: 'a-leads',
            found_at: new Date().toISOString(),
          }
        });

      if (!insertError) {
        created++;
      }
    }

    // Update business: laatste enrichment timestamp
    if (created > 0) {
      await supabase
        .from('companies')
        .update({ last_enriched_at: new Date().toISOString() })
        .eq('id', company_id);
    }

    return new Response(
      JSON.stringify({
        company_id,
        contacts_found: contacts.length,
        contacts_created: created,
        contacts: contacts.map(c => ({
          name: `${c.first_name} ${c.last_name}`,
          title: c.title,
          email: c.email ? '✓' : '✗',
          linkedin: c.linkedin_url ? '✓' : '✗',
        }))
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Find contacts error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
