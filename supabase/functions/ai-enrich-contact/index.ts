import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * AI Enrich Contact — AI research voor personalization
 *
 * Input: { contact_id: string }
 * Output: { enrichment_data: object }
 */

// Kimi API config — set KIMI_API_KEY + KIMI_BASE_URL in Supabase secrets
const KIMI_API_KEY = Deno.env.get('KIMI_API_KEY');
const KIMI_BASE_URL = (Deno.env.get('KIMI_BASE_URL') || 'https://api.kimi.com').replace(/\/$/, '');

async function callKimi(prompt: string): Promise<any> {
  const response = await fetch(`${KIMI_BASE_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KIMI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'kimi-k2-5',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    throw new Error(`Kimi API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.content[0]?.text;

  // Parse JSON uit response
  try {
    // Extract JSON als het in code block zit
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/({[\s\S]*})/);
    return JSON.parse(jsonMatch ? jsonMatch[1] : content);
  } catch (e) {
    console.error('Failed to parse Kimi response:', content);
    throw new Error('Invalid JSON from Kimi');
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { contact_id, cell_id, use_web_research } = await req.json();

    if (!contact_id) {
      return new Response(
        JSON.stringify({ error: 'contact_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Init Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Haal contact + company op
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('*, companies(*)')
      .eq('id', contact_id)
      .single();

    if (contactError || !contact) {
      return new Response(
        JSON.stringify({ error: 'Contact not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const company = contact.companies;

    // Load cell context if cell_id provided
    let cellArchetype: string | null = null
    let enrichmentProfile: Record<string, unknown> | null = null
    let cellLanguage = 'EN'

    if (cell_id) {
      const { data: cell, error: cellError } = await supabase
        .from('campaign_cells')
        .select('campaign_archetype, brief, language')
        .eq('id', cell_id)
        .single()

      if (!cellError && cell) {
        cellArchetype = cell.campaign_archetype
        cellLanguage = cell.language ?? 'EN'
        const brief = (cell.brief as Record<string, unknown>) ?? {}
        enrichmentProfile = (brief.enrichment_profile as Record<string, unknown>) ?? null
      }
    }

    const isDataDriven = cellArchetype === 'data_driven'
    // use_web_research flag: data_driven defaults to false (no web noise), matrix_driven defaults to true
    // Prompt selection below implicitly handles this — data_driven uses account data only

    let enrichment: Record<string, unknown>
    let writeToCustomVars = false

    if (isDataDriven && enrichmentProfile) {
      const promptTemplate = (enrichmentProfile.prompt_template as string) || `Generate 3 short personalization variables for a cold email based on the account data below.
Each variable must be max 15 words, in {{LANGUAGE}}, observational only (no assumptions), and specific to this account.

Account: {{COMPANY}}
Domain: {{DOMAIN}}
Contact: {{CONTACT}}
Title: {{TITLE}}

Return ONLY valid JSON:
{
  "ai_1": "observed fact about company (max 15 words)",
  "ai_2": "implied business tension or gap (max 15 words)",
  "ai_3": "diagnostic hook or question (max 15 words)"
}`

      const prompt = promptTemplate
        .replace(/\{\{COMPANY\}\}/g, company?.name || 'Unknown')
        .replace(/\{\{DOMAIN\}\}/g, company?.domain || company?.website || 'Unknown')
        .replace(/\{\{CONTACT\}\}/g, `${contact.first_name || ''} ${contact.last_name || ''}`.trim())
        .replace(/\{\{TITLE\}\}/g, contact.title || 'Unknown')
        .replace(/\{\{LANGUAGE\}\}/g, cellLanguage === 'NL' ? 'Dutch' : 'English')

      enrichment = await callKimi(prompt)
      writeToCustomVars = true
    } else {
      // AI Research prompt (matrix_driven / default)
      const prompt = `
Research this company and person for cold email personalization:

COMPANY: ${company?.name || 'Unknown'}
DOMAIN: ${company?.domain || company?.website || 'Unknown'}
CATEGORY: ${company?.category || 'Unknown'}
RATING: ${company?.rating || 'N/A'} (${company?.review_count || 0} reviews)

CONTACT: ${contact.first_name || ''} ${contact.last_name || ''}
TITLE: ${contact.title || 'Unknown'}

Return JSON in this exact format:
{
  "company": {
    "description": "What they do (1 sentence)",
    "tech_stack": ["tool1", "tool2"],
    "recent_signals": ["hiring", "funding", "product_launch"],
    "ideal_prospect": true
  },
  "contact": {
    "likely_responsibilities": ["responsibility1"],
    "decision_making_power": "high/medium/low"
  },
  "personalization": {
    "hook": "Specific observation about company/contact (1 sentence)",
    "pain_point": "Likely pain based on research",
    "angle": "Best outreach angle"
  }
}

Only return the JSON, nothing else.`;

      enrichment = await callKimi(prompt)
    }
    const prompt = `
Research this company and person for cold email personalization:

COMPANY: ${company?.name || 'Unknown'}
DOMAIN: ${company?.domain || company?.website || 'Unknown'}
CATEGORY: ${company?.category || 'Unknown'}
RATING: ${company?.rating || 'N/A'} (${company?.review_count || 0} reviews)

CONTACT: ${contact.first_name || ''} ${contact.last_name || ''}
TITLE: ${contact.title || 'Unknown'}

Return JSON in this exact format:
{
  "company": {
    "description": "What they do (1 sentence)",
    "tech_stack": ["tool1", "tool2"],
    "recent_signals": ["hiring", "funding", "product_launch"],
    "ideal_prospect": true
  },
  "contact": {
    "likely_responsibilities": ["responsibility1"],
    "decision_making_power": "high/medium/low"
  },
  "personalization": {
    "hook": "Specific observation about company/contact (1 sentence)",
    "pain_point": "Likely pain based on research",
    "angle": "Best outreach angle"
  }
}

Only return the JSON, nothing else.`;

    const enrichment = await callKimi(prompt);

    // Update contact
    if (writeToCustomVars) {
      const existingCustomVars = (contact.custom_variables as Record<string, unknown>) ?? {}
      await supabase
        .from('contacts')
        .update({
          custom_variables: { ...existingCustomVars, ...enrichment },
          enriched_at: new Date().toISOString()
        })
        .eq('id', contact_id)

      return new Response(
        JSON.stringify({ custom_variables: enrichment, source: 'kimi-k2-5', archetype: cellArchetype }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    await supabase
      .from('contacts')
      .update({
        enrichment_data: enrichment,
        enriched_at: new Date().toISOString()
      })
      .eq('id', contact_id)

    return new Response(
      JSON.stringify({ enrichment_data: enrichment, source: 'kimi-k2-5' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('AI enrichment error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
