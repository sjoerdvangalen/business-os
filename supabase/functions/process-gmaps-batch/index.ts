import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Process Google Maps Batch — Ontvangt batches van GMaps scraper
 *
 * Input: { scraper_job_id: string, businesses: Array }
 * Output: { processed: number, duplicates: number }
 */

// Extract domain van website URL
function extractDomain(website: string | null): string | null {
  if (!website) return null;
  try {
    const url = new URL(website.startsWith('http') ? website : `https://${website}`);
    return url.hostname.replace('www.', '').toLowerCase();
  } catch {
    // Try simple extraction
    const match = website.match(/([a-z0-9-]+\.[a-z]{2,})/i);
    return match ? match[1].toLowerCase() : null;
  }
}

// Parse address components uit Google Maps format
function parseAddress(address: string): { city: string | null; zip_code: string | null } {
  // Dutch format: "Street 1, 1234 AB City"
  const zipMatch = address.match(/(\d{4}\s?[A-Z]{2})/i);
  const zip = zipMatch ? zipMatch[1].replace(' ', '').toUpperCase() : null;

  // City is usually after zip or at the end
  let city = null;
  if (zip) {
    const parts = address.split(zip);
    if (parts[1]) {
      city = parts[1].replace(/^[\s,]+/, '').split(',')[0].trim();
    }
  }

  return { city, zip_code: zip };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { scraper_job_id, businesses, client_id } = await req.json();

    if (!scraper_job_id || !businesses || !Array.isArray(businesses)) {
      return new Response(
        JSON.stringify({ error: 'scraper_job_id and businesses array are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Init Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let processed = 0;
    let duplicates = 0;

    for (const biz of businesses) {
      const domain = extractDomain(biz.website);

      // Check duplicate (op domain of name + city)
      let existing = null;

      if (domain) {
        const { data } = await supabase
          .from('companies')
          .select('id')
          .eq('domain', domain)
          .maybeSingle();
        existing = data;
      }

      if (!existing) {
        const { data } = await supabase
          .from('companies')
          .select('id')
          .ilike('name', biz.name)
          .eq('city', biz.city)
          .maybeSingle();
        existing = data;
      }

      if (existing) {
        duplicates++;
        continue;
      }

      // Parse address
      const { city, zip_code } = biz.address ? parseAddress(biz.address) : { city: null, zip_code: null };

      // Create company
      const { error: insertError } = await supabase
        .from('companies')
        .insert({
          client_id: client_id || null,
          name: biz.name,
          domain: domain,
          address: biz.address,
          phone: biz.phone,
          website: biz.website,
          google_maps_url: biz.url,
          rating: biz.rating ? parseFloat(biz.rating) : null,
          review_count: biz.review_count ? parseInt(biz.review_count) : null,
          city: city || biz.city,
          zip_code: zip_code || biz.zip_code,
          country: 'NL',
          category: biz.category,
          is_multi_location: false,
          status: 'scraped',
          scraped_at: new Date().toISOString(),
          scraper_job_id
        });

      if (insertError) {
        console.error('Failed to insert company:', insertError, biz);
      } else {
        processed++;
      }
    }

    return new Response(
      JSON.stringify({
        processed,
        duplicates,
        total: businesses.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Process GMaps batch error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
