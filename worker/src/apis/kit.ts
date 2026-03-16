/**
 * Kit API — email finder + validator
 * Docs: https://getkit.io/docs
 *
 * Kit heeft twee endpoints:
 * 1. Find: zoek email op basis van naam + domein
 * 2. Verify: valideer of email geldig is
 *
 * Kosten: ~$0.0015 per verify (~0.15 cent)
 */

const KIT_API_KEY = process.env.KIT_API_KEY
const KIT_BASE = 'https://api.getkit.io/v2'

if (!KIT_API_KEY) {
  console.error('KIT_API_KEY niet geconfigureerd')
}

export type KitFindResult = {
  email: string | null
  confidence: number | null
  sources: string[]
  found: boolean
}

export type KitVerifyResult = {
  email: string
  status: 'valid' | 'invalid' | 'risky' | 'unknown'
  reason: string
  is_deliverable: boolean
  is_disposable: boolean
  is_role_based: boolean
  mx_found: boolean
  smtp_check: boolean
}

/**
 * Zoek email op basis van voornaam, achternaam, domein
 */
export async function kitFindEmail(
  firstName: string,
  lastName: string,
  domain: string
): Promise<KitFindResult> {
  if (!KIT_API_KEY) return { email: null, confidence: null, sources: [], found: false }

  try {
    const params = new URLSearchParams({
      api_key: KIT_API_KEY,
      first_name: firstName,
      last_name: lastName,
      domain,
    })

    const res = await fetch(`${KIT_BASE}/email/find?${params}`, {
      headers: { 'Accept': 'application/json' },
    })

    if (!res.ok) {
      if (res.status === 429) throw new Error('Kit rate limit bereikt')
      const body = await res.text()
      throw new Error(`Kit find error ${res.status}: ${body}`)
    }

    const data = await res.json()

    // Kit response structuur
    const email = data.email || data.data?.email || null
    const confidence = data.confidence || data.data?.confidence || null
    const sources = data.sources || data.data?.sources || []

    return {
      email,
      confidence,
      sources,
      found: !!email,
    }
  } catch (err) {
    console.error(`Kit find error (${firstName} ${lastName} @${domain}):`, (err as Error).message)
    return { email: null, confidence: null, sources: [], found: false }
  }
}

/**
 * Valideer of een email adres geldig en deliverable is
 */
export async function kitVerifyEmail(email: string): Promise<KitVerifyResult> {
  const fallback: KitVerifyResult = {
    email,
    status: 'unknown',
    reason: 'api_error',
    is_deliverable: false,
    is_disposable: false,
    is_role_based: false,
    mx_found: false,
    smtp_check: false,
  }

  if (!KIT_API_KEY) return fallback

  try {
    const params = new URLSearchParams({
      api_key: KIT_API_KEY,
      email,
    })

    const res = await fetch(`${KIT_BASE}/email/verify?${params}`, {
      headers: { 'Accept': 'application/json' },
    })

    if (!res.ok) {
      if (res.status === 429) throw new Error('Kit rate limit bereikt')
      const body = await res.text()
      throw new Error(`Kit verify error ${res.status}: ${body}`)
    }

    const data = await res.json()
    const d = data.data || data

    // Normaliseer Kit status naar onze format
    let status: KitVerifyResult['status'] = 'unknown'
    const rawStatus = (d.status || d.result || '').toLowerCase()

    if (rawStatus === 'valid' || rawStatus === 'deliverable') status = 'valid'
    else if (rawStatus === 'invalid' || rawStatus === 'undeliverable') status = 'invalid'
    else if (rawStatus === 'risky' || rawStatus === 'accept_all' || rawStatus === 'catch_all') status = 'risky'

    return {
      email,
      status,
      reason: d.reason || d.sub_status || rawStatus,
      is_deliverable: d.is_deliverable ?? status === 'valid',
      is_disposable: d.is_disposable ?? false,
      is_role_based: d.is_role_based ?? false,
      mx_found: d.mx_found ?? true,
      smtp_check: d.smtp_check ?? false,
    }
  } catch (err) {
    console.error(`Kit verify error (${email}):`, (err as Error).message)
    return { ...fallback, reason: (err as Error).message }
  }
}
