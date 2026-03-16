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
      .select('id, first_name, last_name, email, linkedin_url, company_id')
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

    // Haal domain op van company
    const { data: company } = await supabase
      .from('companies')
      .select('domain, website')
      .eq('id', contact.company_id)
      .single();

    const domain = company?.domain || extractDomainFromWebsite(company?.website);

    if (!domain) {
      await supabase
        .from('contacts')
        .update({ email_waterfall_status: 'failed' })
        .eq('id', contact_id);

      return new Response(
        JSON.stringify({ error: 'No domain found for contact' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. CHECK CACHE
    const linkedinSlug = extractLinkedInSlug(contact.linkedin_url);

    if (linkedinSlug) {
      const { data: cached } = await supabase
        .from('email_cache')
        .select('*')
        .eq('linkedin_slug', linkedinSlug)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (cached?.is_valid) {
        // Update contact met cached email
        await supabase
          .from('contacts')
          .update({
            email: cached.email,
            email_waterfall_status: 'cache_hit',
            email_waterfall_log: { cachedAt: cached.validated_at, lookupCount: cached.lookup_count + 1 }
          })
          .eq('id', contact_id);

        // Update lookup count
        await supabase
          .from('email_cache')
          .update({
            lookup_count: cached.lookup_count + 1,
            last_lookup_at: new Date().toISOString()
          })
          .eq('id', cached.id);

        return new Response(
          JSON.stringify({ email: cached.email, source: 'cache', cost: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 3. PATTERN GENERATIE + TRY KITT VERIFY
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
        // Cache resultaat
        if (linkedinSlug) {
          await supabase
            .from('email_cache')
            .upsert({
              linkedin_slug: linkedinSlug,
              email: pattern,
              is_valid: true,
              validation_source: 'trykitt',
              validation_method: 'pattern',
              confidence_score: verification.score || 80,
              validated_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
            });
        }

        // Update contact
        await supabase
          .from('contacts')
          .update({
            email: pattern,
            email_waterfall_status: 'verified',
            email_waterfall_log: waterfallLog
          })
          .eq('id', contact_id);

        return new Response(
          JSON.stringify({ email: pattern, source: 'trykitt', cost: 0.0015 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Geen patterns werkten
    waterfallLog.endedAt = new Date().toISOString();
    waterfallLog.allFailed = true;

    await supabase
      .from('contacts')
      .update({
        email_waterfall_status: 'failed',
        email_waterfall_log: waterfallLog
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
