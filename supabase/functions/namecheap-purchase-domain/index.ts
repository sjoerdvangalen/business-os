import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const NAMECHEAP_API_USER   = Deno.env.get('NAMECHEAP_API_USER') || ''
const NAMECHEAP_API_KEY    = Deno.env.get('NAMECHEAP_API_KEY') || ''
const NAMECHEAP_USERNAME   = Deno.env.get('NAMECHEAP_USERNAME') || ''
const NAMECHEAP_CLIENT_IP  = Deno.env.get('NAMECHEAP_CLIENT_IP') || ''
const NAMECHEAP_SANDBOX    = Deno.env.get('NAMECHEAP_SANDBOX') === 'true'

const NS1 = Deno.env.get('CLOUDFLARE_DEFAULT_NS1') || 'ns1.cloudflare.com'
const NS2 = Deno.env.get('CLOUDFLARE_DEFAULT_NS2') || 'ns2.cloudflare.com'

const NAMECHEAP_BASE = NAMECHEAP_SANDBOX
  ? 'https://api.sandbox.namecheap.com/xml.response'
  : 'https://api.namecheap.com/xml.response'

function namecheapUrl(command: string, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({
    ApiUser:   NAMECHEAP_API_USER,
    ApiKey:    NAMECHEAP_API_KEY,
    UserName:  NAMECHEAP_USERNAME,
    ClientIp:  NAMECHEAP_CLIENT_IP,
    Command:   command,
    ...extra,
  })
  return `${NAMECHEAP_BASE}?${params}`
}

async function namecheapCall(command: string, extra: Record<string, string> = {}): Promise<{ ok: boolean; xml: string; error?: string }> {
  const url = namecheapUrl(command, extra)
  const res = await fetch(url)
  const xml = await res.text()

  const isOk = xml.includes('Status="OK"')
  if (!isOk) {
    const match = xml.match(/<Error Number="\d+">([^<]+)<\/Error>/)
    return { ok: false, xml, error: match?.[1] ?? 'Namecheap API fout' }
  }
  return { ok: true, xml }
}

async function extractOrderId(xml: string): Promise<string | null> {
  const match = xml.match(/OrderID="(\d+)"/)
  return match?.[1] ?? null
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let body: { client_id?: string; domains: string[]; years?: number }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400
    })
  }

  const { client_id, domains, years = 1 } = body

  if (!domains?.length) {
    return new Response(JSON.stringify({ error: 'domains array vereist' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400
    })
  }

  if (!NAMECHEAP_API_KEY) {
    return new Response(JSON.stringify({ error: 'NAMECHEAP_API_KEY niet geconfigureerd' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500
    })
  }

  const results: Array<{ domain: string; domain_id: string | null; status: string; error?: string }> = []

  for (const domain of domains) {
    // 1. Upsert in domains tabel als 'requested'
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
      .single()

    if (upsertErr) {
      results.push({ domain, domain_id: null, status: 'failed', error: upsertErr.message })
      continue
    }

    const domainId = domainRow.id

    // 2. Status → purchasing
    await supabase.from('domains').update({ purchase_status: 'purchasing' }).eq('id', domainId)

    // 3. Namecheap domains.create
    const purchaseResult = await namecheapCall('namecheap.domains.create', {
      DomainName: domain,
      Years: String(years),
      RegistrantFirstName:  Deno.env.get('NC_REGISTRANT_FIRSTNAME') || 'VGG',
      RegistrantLastName:   Deno.env.get('NC_REGISTRANT_LASTNAME') || 'Acquisition',
      RegistrantAddress1:   Deno.env.get('NC_REGISTRANT_ADDRESS') || '1 Main St',
      RegistrantCity:       Deno.env.get('NC_REGISTRANT_CITY') || 'Amsterdam',
      RegistrantStateProvince: Deno.env.get('NC_REGISTRANT_STATE') || 'NH',
      RegistrantPostalCode: Deno.env.get('NC_REGISTRANT_ZIP') || '1000AA',
      RegistrantCountry:    Deno.env.get('NC_REGISTRANT_COUNTRY') || 'NL',
      RegistrantPhone:      Deno.env.get('NC_REGISTRANT_PHONE') || '+31.0000000000',
      RegistrantEmailAddress: Deno.env.get('NC_REGISTRANT_EMAIL') || 'admin@vggacquisition.com',
      TechFirstName:  Deno.env.get('NC_REGISTRANT_FIRSTNAME') || 'VGG',
      TechLastName:   Deno.env.get('NC_REGISTRANT_LASTNAME') || 'Acquisition',
      TechAddress1:   Deno.env.get('NC_REGISTRANT_ADDRESS') || '1 Main St',
      TechCity:       Deno.env.get('NC_REGISTRANT_CITY') || 'Amsterdam',
      TechStateProvince: Deno.env.get('NC_REGISTRANT_STATE') || 'NH',
      TechPostalCode: Deno.env.get('NC_REGISTRANT_ZIP') || '1000AA',
      TechCountry:    Deno.env.get('NC_REGISTRANT_COUNTRY') || 'NL',
      TechPhone:      Deno.env.get('NC_REGISTRANT_PHONE') || '+31.0000000000',
      TechEmailAddress: Deno.env.get('NC_REGISTRANT_EMAIL') || 'admin@vggacquisition.com',
      AdminFirstName:  Deno.env.get('NC_REGISTRANT_FIRSTNAME') || 'VGG',
      AdminLastName:   Deno.env.get('NC_REGISTRANT_LASTNAME') || 'Acquisition',
      AdminAddress1:   Deno.env.get('NC_REGISTRANT_ADDRESS') || '1 Main St',
      AdminCity:       Deno.env.get('NC_REGISTRANT_CITY') || 'Amsterdam',
      AdminStateProvince: Deno.env.get('NC_REGISTRANT_STATE') || 'NH',
      AdminPostalCode: Deno.env.get('NC_REGISTRANT_ZIP') || '1000AA',
      AdminCountry:    Deno.env.get('NC_REGISTRANT_COUNTRY') || 'NL',
      AdminPhone:      Deno.env.get('NC_REGISTRANT_PHONE') || '+31.0000000000',
      AdminEmailAddress: Deno.env.get('NC_REGISTRANT_EMAIL') || 'admin@vggacquisition.com',
      AuxBillingFirstName:  Deno.env.get('NC_REGISTRANT_FIRSTNAME') || 'VGG',
      AuxBillingLastName:   Deno.env.get('NC_REGISTRANT_LASTNAME') || 'Acquisition',
      AuxBillingAddress1:   Deno.env.get('NC_REGISTRANT_ADDRESS') || '1 Main St',
      AuxBillingCity:       Deno.env.get('NC_REGISTRANT_CITY') || 'Amsterdam',
      AuxBillingStateProvince: Deno.env.get('NC_REGISTRANT_STATE') || 'NH',
      AuxBillingPostalCode: Deno.env.get('NC_REGISTRANT_ZIP') || '1000AA',
      AuxBillingCountry:    Deno.env.get('NC_REGISTRANT_COUNTRY') || 'NL',
      AuxBillingPhone:      Deno.env.get('NC_REGISTRANT_PHONE') || '+31.0000000000',
      AuxBillingEmailAddress: Deno.env.get('NC_REGISTRANT_EMAIL') || 'admin@vggacquisition.com',
    })

    if (!purchaseResult.ok) {
      await supabase.from('domains').update({
        purchase_status: 'failed',
        purchase_error: purchaseResult.error ?? null,
      }).eq('id', domainId)

      results.push({ domain, domain_id: domainId, status: 'failed', error: purchaseResult.error })
      continue
    }

    const namecheapOrderId = await extractOrderId(purchaseResult.xml)

    // 4. Status → purchased
    await supabase.from('domains').update({
      purchase_status: 'purchased',
      namecheap_order_id: namecheapOrderId,
      purchased_at: new Date().toISOString(),
    }).eq('id', domainId)

    // 5. Nameservers instellen (fire-and-forget)
    const setNsUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/namecheap-set-nameservers`
    fetch(setNsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ domain_id: domainId }),
    }).catch(() => {/* ns-set failure wordt gelogd in die functie */})

    results.push({ domain, domain_id: domainId, status: 'purchased' })
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
  })
})
