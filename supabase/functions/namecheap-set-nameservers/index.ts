import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const NAMECHEAP_API_USER  = Deno.env.get('NAMECHEAP_API_USER') || ''
const NAMECHEAP_API_KEY   = Deno.env.get('NAMECHEAP_API_KEY') || ''
const NAMECHEAP_USERNAME  = Deno.env.get('NAMECHEAP_USERNAME') || ''
const NAMECHEAP_CLIENT_IP = Deno.env.get('NAMECHEAP_CLIENT_IP') || ''
const NAMECHEAP_SANDBOX   = Deno.env.get('NAMECHEAP_SANDBOX') === 'true'

const NS1 = Deno.env.get('CLOUDFLARE_DEFAULT_NS1') || 'ns1.cloudflare.com'
const NS2 = Deno.env.get('CLOUDFLARE_DEFAULT_NS2') || 'ns2.cloudflare.com'

const NAMECHEAP_BASE = NAMECHEAP_SANDBOX
  ? 'https://api.sandbox.namecheap.com/xml.response'
  : 'https://api.namecheap.com/xml.response'

function namecheapUrl(command: string, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({
    ApiUser:  NAMECHEAP_API_USER,
    ApiKey:   NAMECHEAP_API_KEY,
    UserName: NAMECHEAP_USERNAME,
    ClientIp: NAMECHEAP_CLIENT_IP,
    Command:  command,
    ...extra,
  })
  return `${NAMECHEAP_BASE}?${params}`
}

async function setCustomNameservers(sld: string, tld: string, nameservers: string[]): Promise<{ ok: boolean; error?: string }> {
  const url = namecheapUrl('namecheap.domains.dns.setCustom', {
    SLD: sld,
    TLD: tld,
    Nameservers: nameservers.join(','),
  })

  const res = await fetch(url)
  const xml = await res.text()

  const isOk = xml.includes('Status="OK"') && xml.includes('IsSuccess="true"')
  if (!isOk) {
    const match = xml.match(/<Error Number="\d+">([^<]+)<\/Error>/)
    return { ok: false, error: match?.[1] ?? 'NS set mislukt' }
  }
  return { ok: true }
}

async function appendDnsEvent(supabase: ReturnType<typeof createClient>, domainId: string, event: object): Promise<void> {
  const { data } = await supabase
    .from('domains')
    .select('dns_events')
    .eq('id', domainId)
    .single()

  const events = Array.isArray(data?.dns_events) ? data.dns_events : []
  await supabase
    .from('domains')
    .update({ dns_events: [...events, { ...event, created_at: new Date().toISOString() }] })
    .eq('id', domainId)
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let body: { domain_id?: string; domain?: string; nameservers?: string[] }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400
    })
  }

  let domainName: string
  let domainId: string | null = null
  const nameservers = body.nameservers ?? [NS1, NS2]

  if (body.domain_id) {
    const { data: row, error } = await supabase
      .from('domains')
      .select('id, domain')
      .eq('id', body.domain_id)
      .single()

    if (error || !row) {
      return new Response(JSON.stringify({ error: 'domain niet gevonden' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404
      })
    }

    domainName = row.domain
    domainId = row.id
  } else if (body.domain) {
    domainName = body.domain
    // Lookup by domain name
    const { data: row } = await supabase
      .from('domains')
      .select('id')
      .eq('domain', body.domain)
      .single()
    domainId = row?.id ?? null
  } else {
    return new Response(JSON.stringify({ error: 'domain_id of domain vereist' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400
    })
  }

  const [sld, ...tldParts] = domainName.split('.')
  const tld = tldParts.join('.')

  // Status → ns_pending
  if (domainId) {
    await supabase.from('domains').update({ purchase_status: 'ns_pending' }).eq('id', domainId)
  }

  // Nameservers instellen
  const result = await setCustomNameservers(sld, tld, nameservers)

  if (!result.ok) {
    if (domainId) {
      await supabase.from('domains').update({
        purchase_status: 'failed',
        purchase_error: result.error ?? null,
      }).eq('id', domainId)

      await appendDnsEvent(supabase, domainId, {
        record_type: 'NS',
        record_value: nameservers.join(','),
        action: 'update',
        source: 'namecheap',
        status: 'error',
        error: result.error,
      })
    }

    return new Response(JSON.stringify({ error: result.error }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500
    })
  }

  // Succes
  if (domainId) {
    await supabase.from('domains').update({
      purchase_status: 'ns_set',
      nameservers,
      ns_set_at: new Date().toISOString(),
    }).eq('id', domainId)

    await appendDnsEvent(supabase, domainId, {
      record_type: 'NS',
      record_value: nameservers.join(','),
      action: 'update',
      source: 'namecheap',
      status: 'success',
    })
  }

  return new Response(JSON.stringify({ domain: domainName, nameservers, status: 'ns_set' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
  })
})
