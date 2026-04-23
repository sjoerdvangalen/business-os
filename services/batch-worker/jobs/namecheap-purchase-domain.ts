/**
 * Namecheap Domain Purchase — ported from Supabase edge function
 * Purchases domains via Namecheap API and triggers nameserver setup
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const NAMECHEAP_API_USER = process.env.NAMECHEAP_API_USER || '';
const NAMECHEAP_API_KEY = process.env.NAMECHEAP_API_KEY || '';
const NAMECHEAP_USERNAME = process.env.NAMECHEAP_USERNAME || '';
const NAMECHEAP_CLIENT_IP = process.env.NAMECHEAP_CLIENT_IP || '';
const NAMECHEAP_SANDBOX = process.env.NAMECHEAP_SANDBOX === 'true';

const NS1 = process.env.CLOUDFLARE_DEFAULT_NS1 || 'ns1.cloudflare.com';
const NS2 = process.env.CLOUDFLARE_DEFAULT_NS2 || 'ns2.cloudflare.com';

const NAMECHEAP_BASE = NAMECHEAP_SANDBOX
  ? 'https://api.sandbox.namecheap.com/xml.response'
  : 'https://api.namecheap.com/xml.response';

function namecheapUrl(command: string, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({
    ApiUser: NAMECHEAP_API_USER,
    ApiKey: NAMECHEAP_API_KEY,
    UserName: NAMECHEAP_USERNAME,
    ClientIp: NAMECHEAP_CLIENT_IP,
    Command: command,
    ...extra,
  });
  return `${NAMECHEAP_BASE}?${params}`;
}

async function namecheapCall(command: string, extra: Record<string, string> = {}): Promise<{ ok: boolean; xml: string; error?: string }> {
  const url = namecheapUrl(command, extra);
  const res = await fetch(url);
  const xml = await res.text();
  const isOk = xml.includes('Status="OK"');
  if (!isOk) {
    const match = xml.match(/<Error Number="\d+">([^<]+)<\/Error>/);
    return { ok: false, xml, error: match?.[1] ?? 'Namecheap API fout' };
  }
  return { ok: true, xml };
}

async function extractOrderId(xml: string): Promise<string | null> {
  const match = xml.match(/OrderID="(\d+)"/);
  return match?.[1] ?? null;
}

export interface PurchaseDomainOptions {
  client_id?: string;
  domains: string[];
  years?: number;
}

export interface PurchaseDomainResult {
  results: Array<{
    domain: string;
    domain_id: string | null;
    status: string;
    error?: string;
  }>;
}

export async function runPurchaseDomain(opts: PurchaseDomainOptions): Promise<PurchaseDomainResult> {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { client_id, domains, years = 1 } = opts;

  if (!domains?.length) {
    throw new Error('domains array required');
  }

  if (!NAMECHEAP_API_KEY) {
    throw new Error('NAMECHEAP_API_KEY not configured');
  }

  const results: Array<{ domain: string; domain_id: string | null; status: string; error?: string }> = [];

  for (const domain of domains) {
    const { data: domainRow, error: upsertErr } = await supabase
      .from('domains')
      .upsert({
        domain,
        client_id: client_id ?? null,
        provider: 'namecheap',
        purchase_status: 'requested',
        years,
      }, { onConflict: 'domain' })
      .select('id')
      .single();

    if (upsertErr) {
      results.push({ domain, domain_id: null, status: 'failed', error: upsertErr.message });
      continue;
    }

    const domainId = domainRow.id;

    await supabase.from('domains').update({ purchase_status: 'purchasing' }).eq('id', domainId);

    const purchaseResult = await namecheapCall('namecheap.domains.create', {
      DomainName: domain,
      Years: String(years),
      RegistrantFirstName: process.env.NC_REGISTRANT_FIRSTNAME || 'VGG',
      RegistrantLastName: process.env.NC_REGISTRANT_LASTNAME || 'Acquisition',
      RegistrantAddress1: process.env.NC_REGISTRANT_ADDRESS || '1 Main St',
      RegistrantCity: process.env.NC_REGISTRANT_CITY || 'Amsterdam',
      RegistrantStateProvince: process.env.NC_REGISTRANT_STATE || 'NH',
      RegistrantPostalCode: process.env.NC_REGISTRANT_ZIP || '1000AA',
      RegistrantCountry: process.env.NC_REGISTRANT_COUNTRY || 'NL',
      RegistrantPhone: process.env.NC_REGISTRANT_PHONE || '+31.0000000000',
      RegistrantEmailAddress: process.env.NC_REGISTRANT_EMAIL || 'admin@vggacquisition.com',
      TechFirstName: process.env.NC_REGISTRANT_FIRSTNAME || 'VGG',
      TechLastName: process.env.NC_REGISTRANT_LASTNAME || 'Acquisition',
      TechAddress1: process.env.NC_REGISTRANT_ADDRESS || '1 Main St',
      TechCity: process.env.NC_REGISTRANT_CITY || 'Amsterdam',
      TechStateProvince: process.env.NC_REGISTRANT_STATE || 'NH',
      TechPostalCode: process.env.NC_REGISTRANT_ZIP || '1000AA',
      TechCountry: process.env.NC_REGISTRANT_COUNTRY || 'NL',
      TechPhone: process.env.NC_REGISTRANT_PHONE || '+31.0000000000',
      TechEmailAddress: process.env.NC_REGISTRANT_EMAIL || 'admin@vggacquisition.com',
      AdminFirstName: process.env.NC_REGISTRANT_FIRSTNAME || 'VGG',
      AdminLastName: process.env.NC_REGISTRANT_LASTNAME || 'Acquisition',
      AdminAddress1: process.env.NC_REGISTRANT_ADDRESS || '1 Main St',
      AdminCity: process.env.NC_REGISTRANT_CITY || 'Amsterdam',
      AdminStateProvince: process.env.NC_REGISTRANT_STATE || 'NH',
      AdminPostalCode: process.env.NC_REGISTRANT_ZIP || '1000AA',
      AdminCountry: process.env.NC_REGISTRANT_COUNTRY || 'NL',
      AdminPhone: process.env.NC_REGISTRANT_PHONE || '+31.0000000000',
      AdminEmailAddress: process.env.NC_REGISTRANT_EMAIL || 'admin@vggacquisition.com',
      AuxBillingFirstName: process.env.NC_REGISTRANT_FIRSTNAME || 'VGG',
      AuxBillingLastName: process.env.NC_REGISTRANT_LASTNAME || 'Acquisition',
      AuxBillingAddress1: process.env.NC_REGISTRANT_ADDRESS || '1 Main St',
      AuxBillingCity: process.env.NC_REGISTRANT_CITY || 'Amsterdam',
      AuxBillingStateProvince: process.env.NC_REGISTRANT_STATE || 'NH',
      AuxBillingPostalCode: process.env.NC_REGISTRANT_ZIP || '1000AA',
      AuxBillingCountry: process.env.NC_REGISTRANT_COUNTRY || 'NL',
      AuxBillingPhone: process.env.NC_REGISTRANT_PHONE || '+31.0000000000',
      AuxBillingEmailAddress: process.env.NC_REGISTRANT_EMAIL || 'admin@vggacquisition.com',
    });

    if (!purchaseResult.ok) {
      await supabase.from('domains').update({
        purchase_status: 'failed',
        purchase_error: purchaseResult.error ?? null,
      }).eq('id', domainId);

      results.push({ domain, domain_id: domainId, status: 'failed', error: purchaseResult.error });
      continue;
    }

    const namecheapOrderId = await extractOrderId(purchaseResult.xml);

    await supabase.from('domains').update({
      purchase_status: 'purchased',
      namecheap_order_id: namecheapOrderId,
      purchased_at: new Date().toISOString(),
    }).eq('id', domainId);

    // Fire-and-forget nameserver setup via Railway
    const railwayUrl = process.env.RAILWAY_BATCH_WORKER_URL;
    if (railwayUrl) {
      fetch(`${railwayUrl}/namecheap/set-nameservers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain_id: domainId }),
      }).catch(() => { /* ns-set failure logged elsewhere */ });
    }

    results.push({ domain, domain_id: domainId, status: 'purchased' });
  }

  return { results };
}
