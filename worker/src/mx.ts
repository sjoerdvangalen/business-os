/**
 * MX Lookup — detecteer ESP en email gateways
 *
 * Gebruikt de DNS module van Bun/Node om MX records op te halen.
 * Resultaten worden gecached in de mx_cache tabel (geen TTL — domeinen
 * wisselen zelden van ESP, 30-dag hercheck is meer dan genoeg).
 *
 * Detectie:
 * - Google Workspace: aspmx.l.google.com
 * - Microsoft 365:    mail.protection.outlook.com
 * - Gateway detectie: Proofpoint (pphosted.com), Mimecast (mimecast.com)
 *   Gateways betekenen strict filtering — sla deze leads op maar markeer ze.
 */

import { promises as dns } from 'dns'
import type { SupabaseClient } from '@supabase/supabase-js'

export type MxInfo = {
  domain: string
  mx_provider: 'google' | 'microsoft' | 'other' | 'none'
  has_gateway: boolean
  gateway_type: string | null
}

/** Cache in-memory per worker run (naast DB cache) */
const memCache = new Map<string, MxInfo>()

/**
 * Haal MX info op voor een domein.
 * Kijkt eerst in memory cache, dan DB cache, dan DNS.
 */
export async function getMxInfo(domain: string, supabase: SupabaseClient): Promise<MxInfo> {
  const normalized = domain.toLowerCase().trim()

  // 1. Memory cache
  if (memCache.has(normalized)) {
    return memCache.get(normalized)!
  }

  // 2. DB cache
  try {
    const { data } = await supabase
      .from('mx_cache')
      .select('mx_provider, has_gateway, gateway_type')
      .eq('domain', normalized)
      .single()

    if (data) {
      const info: MxInfo = {
        domain: normalized,
        mx_provider: data.mx_provider as MxInfo['mx_provider'],
        has_gateway: data.has_gateway,
        gateway_type: data.gateway_type,
      }
      memCache.set(normalized, info)
      return info
    }
  } catch { /* not cached */ }

  // 3. DNS lookup
  const info = await lookupMx(normalized)

  // Sla op in DB
  await supabase.from('mx_cache').upsert({
    domain: normalized,
    mx_provider: info.mx_provider,
    has_gateway: info.has_gateway,
    gateway_type: info.gateway_type,
    checked_at: new Date().toISOString(),
  }, { onConflict: 'domain' })

  memCache.set(normalized, info)
  return info
}

async function lookupMx(domain: string): Promise<MxInfo> {
  const result: MxInfo = {
    domain,
    mx_provider: 'none',
    has_gateway: false,
    gateway_type: null,
  }

  try {
    const records = await dns.resolveMx(domain)
    if (!records || records.length === 0) return result

    const exchanges = records.map(r => r.exchange.toLowerCase())

    // Detecteer ESP
    if (exchanges.some(e => e.includes('aspmx.l.google.com') || e.includes('googlemail.com'))) {
      result.mx_provider = 'google'
    } else if (exchanges.some(e => e.includes('mail.protection.outlook.com') || e.includes('outlook.com'))) {
      result.mx_provider = 'microsoft'
    } else {
      result.mx_provider = 'other'
    }

    // Detecteer gateways (strict filtering)
    if (exchanges.some(e => e.includes('pphosted.com'))) {
      result.has_gateway = true
      result.gateway_type = 'proofpoint'
    } else if (exchanges.some(e => e.includes('mimecast.com'))) {
      result.has_gateway = true
      result.gateway_type = 'mimecast'
    } else if (exchanges.some(e => e.includes('barracuda') || e.includes('ess.barracudanetworks.com'))) {
      result.has_gateway = true
      result.gateway_type = 'barracuda'
    }

  } catch (err) {
    // DNS lookup mislukt (domein bestaat niet, timeout, etc.)
    result.mx_provider = 'none'
  }

  return result
}

/** Genereer email patterns op basis van naam + domein */
export function generateEmailPatterns(
  firstName: string,
  lastName: string,
  domain: string
): string[] {
  if (!firstName || !domain) return []

  const f = firstName.toLowerCase().trim()
  const l = lastName?.toLowerCase().trim() || ''

  // Strip accenten/diacritics
  const normalize = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')

  const fn = normalize(f)
  const ln = normalize(l)

  if (!fn) return []

  const patterns: string[] = []

  // Meest voorkomende patronen eerst (hoog → laag succes rate)
  patterns.push(`${fn}@${domain}`)                         // john@company.com
  if (ln) {
    patterns.push(`${fn}.${ln}@${domain}`)                  // john.smith@company.com
    patterns.push(`${fn[0]}${ln}@${domain}`)                // jsmith@company.com
    patterns.push(`${fn}${ln}@${domain}`)                   // johnsmith@company.com
    patterns.push(`${ln}.${fn}@${domain}`)                  // smith.john@company.com
    patterns.push(`${fn[0]}.${ln}@${domain}`)               // j.smith@company.com
    patterns.push(`${fn}${ln[0]}@${domain}`)                // johns@company.com
    patterns.push(`${fn}-${ln}@${domain}`)                  // john-smith@company.com
    patterns.push(`${ln}@${domain}`)                        // smith@company.com
    patterns.push(`${ln}${fn[0]}@${domain}`)                // smithj@company.com
  }

  // Uniek maken, max 8 patronen
  return [...new Set(patterns)].slice(0, 8)
}
