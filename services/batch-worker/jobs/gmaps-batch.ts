/**
 * Process Google Maps Batch — Unified Model Version
 * Port van supabase/functions/process-gmaps-batch/index.ts naar Bun/Railway
 *
 * Input: { scraper_job_id: string, companies: Array, client_id?: string }
 * Output: { processed: number, duplicates: number, companies_created: number, total: number }
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Extract domain van website URL
function extractDomain(website: string | null): string | null {
  if (!website) return null;
  try {
    const url = new URL(website.startsWith('http') ? website : `https://${website}`);
    return url.hostname.replace('www.', '').toLowerCase();
  } catch {
    const match = website.match(/([a-z0-9-]+\.[a-z]{2,})/i);
    return match ? match[1].toLowerCase() : null;
  }
}

// Parse address components uit Google Maps format
function parseAddress(address: string): { city: string | null; zip_code: string | null } {
  const zipMatch = address.match(/(\d{4}\s?[A-Z]{2})/i);
  const zip = zipMatch ? zipMatch[1].replace(' ', '').toUpperCase() : null;

  let city = null;
  if (zip) {
    const parts = address.split(zip);
    if (parts[1]) {
      city = parts[1].replace(/^[\s,]+/, '').split(',')[0].trim();
    }
  }

  return { city, zip_code: zip };
}

// Get employee range from employee count
function getEmployeeRange(count: number | null): string | null {
  if (!count) return null;
  if (count <= 10) return '1-10';
  if (count <= 50) return '11-50';
  if (count <= 200) return '51-200';
  if (count <= 500) return '201-500';
  if (count <= 1000) return '501-1000';
  return '1000+';
}

export interface GmapsBatchOptions {
  scraper_job_id: string;
  companies: any[];
  client_id?: string;
}

export interface GmapsBatchResult {
  processed: number;
  duplicates: number;
  companies_created: number;
  total: number;
}

export async function processGmapsBatch(opts: GmapsBatchOptions): Promise<GmapsBatchResult> {
  const { scraper_job_id, companies, client_id } = opts;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let processed = 0;
  let duplicates = 0;
  let companiesCreated = 0;

  for (const biz of companies) {
    const domain = extractDomain(biz.website);

    // Check duplicate business (op domain of name + city)
    let existingBusinessId: string | null = null;

    if (domain) {
      const { data } = await supabase
        .from('companies')
        .select('id')
        .eq('domain', domain)
        .maybeSingle();
      existingBusinessId = data?.id || null;
    }

    if (!existingBusinessId && biz.name) {
      const { data } = await supabase
        .from('companies')
        .select('id')
        .ilike('name', biz.name)
        .eq('city', biz.city)
        .maybeSingle();
      existingBusinessId = data?.id || null;
    }

    let businessId: string;

    if (existingBusinessId) {
      duplicates++;
      businessId = existingBusinessId;
    } else {
      // Parse address
      const { city, zip_code } = biz.address ? parseAddress(biz.address) : { city: null, zip_code: null };

      // Create new business
      const { data: newBusiness, error: insertError } = await supabase
        .from('companies')
        .insert({
          name: biz.name || 'Unknown Business',
          domain: domain,
          website: biz.website,
          city: city || biz.city,
          state: zip_code,
          country: biz.country || 'NL',
          industry: biz.category,
          employee_count: biz.employee_count ? parseInt(biz.employee_count) : null,
          employee_range: getEmployeeRange(biz.employee_count ? parseInt(biz.employee_count) : null),
          source: 'gmaps_scraper',
          source_id: scraper_job_id,
          business_type: 'prospect',
          enrichment_data: {
            gmaps_data: {
              google_maps_url: biz.url,
              rating: biz.rating ? parseFloat(biz.rating) : null,
              review_count: biz.review_count ? parseInt(biz.review_count) : null,
              address: biz.address,
              phone: biz.phone,
              category: biz.category,
            },
            scraped_at: new Date().toISOString(),
            scraper_job_id,
          },
          tags: biz.category ? [biz.category] : [],
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('Failed to insert business:', insertError, biz);
        continue;
      }

      businessId = newBusiness!.id;
      companiesCreated++;
    }

    // If business has contact info, create contact
    if (biz.email || biz.contact_name || biz.contact_email) {
      const contactEmail = biz.contact_email || biz.email;

      // Check if contact already exists
      let existingContactId: string | null = null;
      if (contactEmail) {
        const { data } = await supabase
          .from('contacts')
          .select('id')
          .eq('email', contactEmail)
          .maybeSingle();
        existingContactId = data?.id || null;
      }

      if (!existingContactId) {
        // Parse contact name
        const fullName = biz.contact_name || '';
        const nameParts = fullName.split(' ');
        const firstName = nameParts[0] || null;
        const lastName = nameParts.slice(1).join(' ') || null;

        const { error: contactError } = await supabase
          .from('contacts')
          .insert({
            company_id: businessId,
            first_name: firstName,
            last_name: lastName,
            email: contactEmail,
            client_id: client_id || null,
            contact_status: 'new',
            source: 'gmaps_scraper',
            enrichment_data: {
              gmaps_data: {
                phone: biz.contact_phone || biz.phone,
                position: biz.contact_position,
              },
            },
          });

        if (contactError) {
          console.error('Failed to insert contact:', contactError, biz);
        }
      }
    }

    processed++;
  }

  // Update scraper run status
  await supabase
    .from('scraper_runs')
    .update({
      processed_count: processed,
      duplicates_count: duplicates,
      companies_created: companiesCreated,
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', scraper_job_id);

  return {
    processed,
    duplicates,
    companies_created: companiesCreated,
    total: companies.length,
  };
}
