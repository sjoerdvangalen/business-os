/**
 * Email Waterfall — vindt en valideert emails voor leads
 *
 * Volgorde (goedkoop → duur):
 * 1. Cache check (email_cache tabel, 90 dagen geldig)
 * 2. Pattern generatie + Kit verify (goedkoop: ~0.15ct/check)
 * 3. Kit finder (als patterns mislukken)
 * [Later: 4. Enrow, 5. LeadMagic]
 *
 * Resultaten worden opgeslagen in:
 * - email_cache: voor hergebruik
 * - lead_pool: update email_status, email_found_by, email_validated_by
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { kitFindEmail, kitVerifyEmail } from './apis/kit.ts'
import { getMxInfo, generateEmailPatterns } from './mx.ts'

const CACHE_VALID_DAYS = 90

export type WaterfallResult = {
  leadId: string
  email: string | null
  status: 'valid' | 'invalid' | 'risky' | 'unknown' | 'not_found'
  foundBy: string | null
  validatedBy: string | null
  fromCache: boolean
  mxProvider: string | null
}

/**
 * Verwerk één lead door de waterfall
 */
export async function runWaterfall(
  supabase: SupabaseClient,
  lead: {
    id: string
    email: string | null
    first_name: string | null
    last_name: string | null
    full_name: string | null
    linkedin_url: string | null
    company_domain: string | null
    company_name: string | null
  }
): Promise<WaterfallResult> {
  const result: WaterfallResult = {
    leadId: lead.id,
    email: null,
    status: 'not_found',
    foundBy: null,
    validatedBy: null,
    fromCache: false,
    mxProvider: null,
  }

  // Parseer naam
  const firstName = lead.first_name || lead.full_name?.split(' ')[0] || ''
  const lastName = lead.last_name || lead.full_name?.split(' ').slice(1).join(' ') || ''
  const domain = lead.company_domain

  if (!domain) {
    console.log(`  [${lead.id.slice(0, 8)}] Geen domein — skip`)
    return result
  }

  // MX info ophalen
  const mxInfo = await getMxInfo(domain, supabase)
  result.mxProvider = mxInfo.mx_provider

  // Stap 1: Check email cache
  if (lead.email || (firstName && lastName)) {
    const cacheHit = await checkEmailCache(supabase, {
      email: lead.email || null,
      linkedinUrl: lead.linkedin_url,
      firstName,
      lastName,
      domain,
    })

    if (cacheHit) {
      console.log(`  [${lead.id.slice(0, 8)}] Cache hit: ${cacheHit.email} (${cacheHit.status})`)
      result.email = cacheHit.email
      result.status = cacheHit.status as WaterfallResult['status']
      result.foundBy = cacheHit.found_by
      result.validatedBy = cacheHit.validated_by
      result.fromCache = true
      return result
    }
  }

  // Stap 2: Als al een email hebben — alleen valideren
  if (lead.email) {
    console.log(`  [${lead.id.slice(0, 8)}] Verifieer bestaande email: ${lead.email}`)
    const verification = await kitVerifyEmail(lead.email)

    await storeInCache(supabase, {
      linkedinUrl: lead.linkedin_url,
      firstName,
      lastName,
      domain,
      email: lead.email,
      status: verification.status,
      foundBy: 'existing',
      validatedBy: 'kit',
    })

    result.email = lead.email
    result.status = verification.status
    result.foundBy = 'existing'
    result.validatedBy = 'kit'
    return result
  }

  // Stap 3: Pattern generatie + Kit verify
  if (firstName && lastName && domain) {
    const patterns = generateEmailPatterns(firstName, lastName, domain)
    console.log(`  [${lead.id.slice(0, 8)}] Probeer ${patterns.length} patronen voor ${firstName} ${lastName} @${domain}`)

    for (const pattern of patterns) {
      const verification = await kitVerifyEmail(pattern)

      if (verification.status === 'valid') {
        console.log(`  [${lead.id.slice(0, 8)}] Patroon gevonden: ${pattern}`)

        await storeInCache(supabase, {
          linkedinUrl: lead.linkedin_url,
          firstName,
          lastName,
          domain,
          email: pattern,
          status: 'valid',
          foundBy: 'pattern',
          validatedBy: 'kit',
        })

        result.email = pattern
        result.status = 'valid'
        result.foundBy = 'pattern'
        result.validatedBy = 'kit'
        return result
      }

      // Kleine pauze om rate limits te respecteren
      await sleep(150)
    }
  }

  // Stap 4: Kit Finder (als patronen mislukken)
  if (firstName && lastName && domain) {
    console.log(`  [${lead.id.slice(0, 8)}] Kit finder voor ${firstName} ${lastName} @${domain}`)
    const findResult = await kitFindEmail(firstName, lastName, domain)

    if (findResult.found && findResult.email) {
      // Verifieer gevonden email
      const verification = await kitVerifyEmail(findResult.email)

      await storeInCache(supabase, {
        linkedinUrl: lead.linkedin_url,
        firstName,
        lastName,
        domain,
        email: findResult.email,
        status: verification.status,
        foundBy: 'kit_finder',
        validatedBy: 'kit',
      })

      result.email = findResult.email
      result.status = verification.status
      result.foundBy = 'kit_finder'
      result.validatedBy = 'kit'
      return result
    }
  }

  // Niet gevonden
  console.log(`  [${lead.id.slice(0, 8)}] Niet gevonden voor ${firstName} ${lastName} @${domain}`)
  return result
}

// ── Helpers ────────────────────────────────────────────────────────────────

type CacheHit = {
  email: string
  status: string
  found_by: string
  validated_by: string | null
}

async function checkEmailCache(
  supabase: SupabaseClient,
  opts: { email: string | null; linkedinUrl: string | null; firstName: string; lastName: string; domain: string }
): Promise<CacheHit | null> {
  const cutoff = new Date(Date.now() - CACHE_VALID_DAYS * 86400 * 1000).toISOString()

  // Zoek op exact email
  if (opts.email) {
    try {
      const { data } = await supabase
        .from('email_cache')
        .select('email, email_status, found_by, validated_by, validated_at')
        .eq('email', opts.email)
        .gt('found_at', cutoff)
        .order('found_at', { ascending: false })
        .limit(1)
        .single()

      if (data) {
        return { email: data.email, status: data.email_status, found_by: data.found_by, validated_by: data.validated_by }
      }
    } catch { /* not found */ }
  }

  // Zoek op linkedin URL
  if (opts.linkedinUrl) {
    try {
      const { data } = await supabase
        .from('email_cache')
        .select('email, email_status, found_by, validated_by')
        .eq('linkedin_url', opts.linkedinUrl)
        .gt('found_at', cutoff)
        .order('found_at', { ascending: false })
        .limit(1)
        .single()

      if (data) return { email: data.email, status: data.email_status, found_by: data.found_by, validated_by: data.validated_by }
    } catch { /* not found */ }
  }

  // Zoek op naam + domein combinatie
  if (opts.firstName && opts.lastName && opts.domain) {
    const fullName = `${opts.firstName} ${opts.lastName}`.trim()
    try {
      const { data } = await supabase
        .from('email_cache')
        .select('email, email_status, found_by, validated_by')
        .eq('full_name', fullName)
        .eq('company_domain', opts.domain)
        .gt('found_at', cutoff)
        .order('found_at', { ascending: false })
        .limit(1)
        .single()

      if (data) return { email: data.email, status: data.email_status, found_by: data.found_by, validated_by: data.validated_by }
    } catch { /* not found */ }
  }

  return null
}

async function storeInCache(
  supabase: SupabaseClient,
  opts: {
    linkedinUrl: string | null
    firstName: string
    lastName: string
    domain: string
    email: string
    status: string
    foundBy: string
    validatedBy: string
  }
) {
  const revalidationDue = new Date(Date.now() + CACHE_VALID_DAYS * 86400 * 1000).toISOString()

  await supabase.from('email_cache').upsert({
    linkedin_url: opts.linkedinUrl,
    full_name: `${opts.firstName} ${opts.lastName}`.trim() || null,
    company_domain: opts.domain,
    email: opts.email,
    email_status: opts.status,
    found_by: opts.foundBy,
    found_at: new Date().toISOString(),
    validated_by: opts.validatedBy,
    validated_at: new Date().toISOString(),
    revalidation_due_at: revalidationDue,
  }, {
    onConflict: 'email,found_by',
    ignoreDuplicates: false,
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
