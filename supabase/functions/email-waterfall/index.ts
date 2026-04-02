import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Email Waterfall — Verifieer emails via TryKitt
 *
 * Flow:
 *   1. Check cache (90 dagen)
 *   2. Genereer patterns (first@, f.last@, etc.)
 *   3. Verifieer met TryKitt
 *   4. Cache resultaat
 *
 * Input: { contact_id: string }
 * Output: { email: string | null, source: string, cost: number }
 */

// TryKitt API config
const TRY_KITT_API_KEY = Deno.env.get('TRYKITT_API_KEY');
const TRY_KITT_BASE_URL = 'https://api.trykitt.com/v1';

// Pattern generators
function generatePatterns(firstName: string, lastName: string, domain: string): string[] {
  const f = firstName.toLowerCase().trim();
  const l = lastName.toLowerCase().trim();
  const d = domain.toLowerCase().trim();

  return [
    `${f}@${d}`,                    // luke@
    `${f}.${l}@${d}`,               // luke.van.galen@
    `${f}${l}@${d}`,                // lukevangalen@
    `${f[0]}${l}@${d}`,             // lvangalen@
    `${f[0]}.${l}@${d}`,            // l.vangalen@
  ];
}

// Extract LinkedIn slug uit URL
function extractLinkedInSlug(url: string): string | null {
  if (!url) return null;
  const match = url.match(/linkedin\.com\/in\/([^\/\?]+)/i);
  return match ? match[1].toLowerCase() : null;
}

// TryKitt verify email
async function verifyWithTryKitt(email: string): Promise<{ isValid: boolean; score?: number; reason?: string }> {
  try {
    const response = await fetch(`${TRY_KITT_BASE_URL}/verify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TRY_KITT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.log('Rate limited by TryKitt, waiting...');
        await new Promise(r => setTimeout(r, 1000));
        return verifyWithTryKitt(email); // Retry
      }
      throw new Error(`TryKitt API error: ${response.status}`);
    }

    const data = await response.json();

    // TryKitt returns: valid, risky, invalid, unknown
    return {
      isValid: data.status === 'valid' || data.status === 'risky',
      score: data.score,
      reason: data.reason,
    };
  } catch (error) {
    console.error('TryKitt verification failed:', error);
    return { isValid: false, reason: 'api_error' };
  }
}

// Main handler
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { contact_id } = await req.json();

    if (!contact_id) {
      return new Response(
        JSON.stringify({ error: 'contact_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Init Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Haal contact op
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, linkedin_url, business_id')
      .eq('id', contact_id)
      .single();

    if (contactError || !contact) {
      return new Response(
        JSON.stringify({ error: 'Contact not found', details: contactError }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Als al een email heeft, skip
    if (contact.email) {
      return new Response(
        JSON.stringify({ email: contact.email, source: 'existing', cost: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Haal domain op van business
    const { data: business } = await supabase
      .from('companies')
      .select('domain, website')
      .eq('id', contact.business_id)
      .single();

    const domain = business?.domain || extractDomainFromWebsite(business?.website);

    if (!domain) {
      await supabase
        .from('contacts')
        .update({ email_waterfall_status: 'failed', email_verified: false })
        .eq('id', contact_id);

      return new Response(
        JSON.stringify({ error: 'No domain found for contact' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. PATTERN GENERATIE + TRY KITT VERIFY
    // Note: cache check is niet meer nodig — als het contact al een geverifieerd email heeft
    // wordt dat al teruggegeven op regel 120 via de bestaande email check.
    const patterns = generatePatterns(contact.first_name || '', contact.last_name || '', domain);
    const waterfallLog = {
      patternsTried: patterns,
      results: [] as any[],
      startedAt: new Date().toISOString()
    };

    for (const pattern of patterns) {
      const verification = await verifyWithTryKitt(pattern);

      waterfallLog.results.push({
        pattern,
        isValid: verification.isValid,
        score: verification.score,
        reason: verification.reason
      });

      if (verification.isValid) {
        // Update contact met verified email
        await supabase
          .from('contacts')
          .update({
            email: pattern,
            email_verified: true,
            email_verified_at: new Date().toISOString(),
            email_waterfall_status: 'verified',
          })
          .eq('id', contact_id);

        return new Response(
          JSON.stringify({ email: pattern, source: 'trykitt', cost: 0.0015 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Geen patterns werkten
    await supabase
      .from('contacts')
      .update({
        email_verified: false,
        email_waterfall_status: 'failed',
      })
      .eq('id', contact_id);

    return new Response(
      JSON.stringify({ email: null, source: 'failed', cost: patterns.length * 0.0015 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Email waterfall error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper: extract domain van website URL
function extractDomainFromWebsite(website: string | null): string | null {
  if (!website) return null;
  try {
    const url = new URL(website.startsWith('http') ? website : `https://${website}`);
    return url.hostname.replace('www.', '');
  } catch {
    return null;
  }
}
