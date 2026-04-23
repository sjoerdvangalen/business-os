/**
 * Namecheap Set Nameservers — ported from Supabase edge function
 * Sets Cloudflare nameservers on purchased domains
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

async function setCustomNameservers(sld: string, tld: string, nameservers: string[]): Promise<{ ok: boolean; error?: string }> {
  const url = namecheapUrl('namecheap.domains.dns.setCustom', {
    SLD: sld,
    TLD: tld,
    Nameservers: nameservers.join(','),
  });

  const res = await fetch(url);
  const xml = await res.text();

  const isOk = xml.includes('Status="OK"') && xml.includes('IsSuccess="true"');
  if (!isOk) {
    const match = xml.match(/<Error Number="\d+">([^<]+)<\/Error>/);
    return { ok: false, error: match?.[1] ?? 'NS set mislukt' };
  }
  return { ok: true };
}

async function appendDnsEvent(supabase: ReturnType<typeof createClient>, domainId: string, event: object): Promise<void> {
  const { data } = await supabase
    .from('domains')
    .select('dns_events')
    .eq('id', domainId)
    .single();

  const events = Array.isArray(data?.dns_events) ? data.dns_events : [];
  await supabase
    .from('domains')
    .update({ dns_events: [...events, { ...event, created_at: new Date().toISOString() }] })
    .eq('id', domainId);
}

export interface SetNameserversOptions {
  domain_id?: string;
  domain?: string;
  nameservers?: string[];
}

export interface SetNameserversResult {
  domain: string;
  nameservers: string[];
  status: string;
  error?: string;
}

export async function runSetNameservers(opts: SetNameserversOptions): Promise<SetNameserversResult> {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { domain_id, domain, nameservers: customNameservers } = opts;

  let domainName: string;
  let domainIdResolved: string | null = null;
  const nameservers = customNameservers ?? [NS1, NS2];

  if (domain_id) {
    const { data: row, error } = await supabase
      .from('domains')
      .select('id, domain')
      .eq('id', domain_id)
      .single();

    if (error || !row) {
      throw new Error('domain not found');
    }

    domainName = row.domain;
    domainIdResolved = row.id;
  } else if (domain) {
    domainName = domain;
    const { data: row } = await supabase
      .from('domains')
      .select('id')
      .eq('domain', domain)
      .single();
    domainIdResolved = row?.id ?? null;
  } else {
    throw new Error('domain_id or domain required');
  }

  const [sld, ...tldParts] = domainName.split('.');
  const tld = tldParts.join('.');

  if (domainIdResolved) {
    await supabase.from('domains').update({ purchase_status: 'ns_pending' }).eq('id', domainIdResolved);
  }

  const result = await setCustomNameservers(sld, tld, nameservers);

  if (!result.ok) {
    if (domainIdResolved) {
      await supabase.from('domains').update({
        purchase_status: 'failed',
        purchase_error: result.error ?? null,
      }).eq('id', domainIdResolved);

      await appendDnsEvent(supabase, domainIdResolved, {
        record_type: 'NS',
        record_value: nameservers.join(','),
        action: 'update',
        source: 'namecheap',
        status: 'error',
        error: result.error,
      });
    }

    throw new Error(result.error);
  }

  if (domainIdResolved) {
    await supabase.from('domains').update({
      purchase_status: 'ns_set',
      nameservers,
      ns_set_at: new Date().toISOString(),
    }).eq('id', domainIdResolved);

    await appendDnsEvent(supabase, domainIdResolved, {
      record_type: 'NS',
      record_value: nameservers.join(','),
      action: 'update',
      source: 'namecheap',
      status: 'success',
    });
  }

  return { domain: domainName, nameservers, status: 'ns_set' };
}
