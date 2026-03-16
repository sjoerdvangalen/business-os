#!/usr/bin/env -S bun run
/**
 * bulk-import-csv.ts
 *
 * Importeer CSV exports (Apollo, Clay, LinkedIn, handmatig) naar lead_pool.
 *
 * Gebruik:
 *   bun run scripts/bulk-import-csv.ts --file leads.csv --source apollo
 *   bun run scripts/bulk-import-csv.ts --file clay-export.csv --source clay --list "ICP Q1 2026"
 *   bun run scripts/bulk-import-csv.ts --file google-maps.csv --source google_maps --dry-run
 *
 * Kolom mapping (case-insensitive, meerdere aliassen per veld):
 *   email           → email, email_address, work_email
 *   first_name      → first_name, firstname, first name
 *   last_name       → last_name, lastname, last name
 *   full_name       → full_name, name, contact_name
 *   position        → position, title, job_title, seniority
 *   phone           → phone, phone_number, mobile
 *   linkedin_url    → linkedin_url, linkedin, person_linkedin_url
 *   company_name    → company, company_name, organization, account_name
 *   company_domain  → company_domain, domain, website_domain
 *   company_website → company_website, website, company_url
 *   industry        → industry, vertical
 *   city            → city
 *   state           → state, province, region
 *   country         → country, country_name
 */

import { createClient } from '@supabase/supabase-js'
import { parse } from 'csv-parse/sync'
import { readFileSync, existsSync } from 'fs'
import { resolve, basename } from 'path'

// ── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BATCH_SIZE = 200

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Vereist: SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Kolom aliassen ──────────────────────────────────────────────────────────

const FIELD_MAP: Record<string, string[]> = {
  email:            ['email', 'email_address', 'work_email', 'e-mail', 'emailaddress'],
  first_name:       ['first_name', 'firstname', 'first name', 'voornaam'],
  last_name:        ['last_name', 'lastname', 'last name', 'achternaam'],
  full_name:        ['full_name', 'name', 'contact_name', 'full name', 'person_name'],
  position:         ['position', 'title', 'job_title', 'jobtitle', 'seniority', 'functie'],
  phone:            ['phone', 'phone_number', 'phonenumber', 'mobile', 'telefoon'],
  linkedin_url:     ['linkedin_url', 'linkedin', 'person_linkedin_url', 'linkedin_profile', 'profile_url', 'li_url'],
  company_name:     ['company', 'company_name', 'organization', 'organisation', 'account_name', 'bedrijf'],
  company_domain:   ['company_domain', 'domain', 'website_domain', 'email_domain'],
  company_website:  ['company_website', 'website', 'company_url', 'company_website_url', 'url'],
  industry:         ['industry', 'vertical', 'sector', 'industrie'],
  city:             ['city', 'stad'],
  state:            ['state', 'province', 'region', 'provincie'],
  country:          ['country', 'country_name', 'land'],
}

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)

function getArg(flag: string): string | null {
  const idx = args.indexOf(flag)
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null
}

const filePath = getArg('--file')
const source   = getArg('--source') || 'csv'
const listName = getArg('--list') || null
const dryRun   = args.includes('--dry-run')

if (!filePath) {
  console.error('Vereist: --file <pad-naar-csv>')
  console.error('Optioneel: --source <apollo|clay|linkedin|google_maps|manual>')
  console.error('           --list "<lijstnaam>"')
  console.error('           --dry-run')
  process.exit(1)
}

const absolutePath = resolve(filePath)
if (!existsSync(absolutePath)) {
  console.error(`Bestand niet gevonden: ${absolutePath}`)
  process.exit(1)
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildColumnMap(headers: string[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const header of headers) {
    const normalized = header.toLowerCase().trim()
    for (const [field, aliases] of Object.entries(FIELD_MAP)) {
      if (aliases.some(a => a === normalized || a === normalized.replace(/\s+/g, '_'))) {
        if (!map.has(header)) map.set(header, field)
        break
      }
    }
  }
  return map
}

function normalizeUrl(url: string): string {
  if (!url) return url
  url = url.trim()
  if (!url.startsWith('http')) url = 'https://' + url
  return url.replace(/\/$/, '')
}

function normalizeLinkedin(url: string): string {
  return url
    .replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, 'https://www.linkedin.com/in/')
    .replace(/\/$/, '')
}

function extractDomain(website: string): string {
  try {
    const url = new URL(normalizeUrl(website))
    return url.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0].toLowerCase()
  }
}

function normalizeRow(
  row: Record<string, string>,
  colMap: Map<string, string>,
  source: string,
  sourceList: string | null
): Record<string, unknown> | null {
  const mapped: Record<string, unknown> = {
    source,
    source_list: sourceList,
    email_status: 'unknown',
  }

  for (const [csvCol, value] of Object.entries(row)) {
    const field = colMap.get(csvCol)
    if (field && value?.trim()) {
      mapped[field] = value.trim()
    }
  }

  // Email of LinkedIn is verplicht
  const email = mapped.email ? (mapped.email as string).toLowerCase().trim() : null
  const linkedin = mapped.linkedin_url as string | undefined

  if (!email && !linkedin) return null
  if (email) mapped.email = email

  // Normaliseer URLs
  if (linkedin) mapped.linkedin_url = normalizeLinkedin(linkedin)
  if (mapped.company_website) {
    mapped.company_website = normalizeUrl(mapped.company_website as string)
  }

  // Leid company_domain af
  if (!mapped.company_domain) {
    if (mapped.company_website) {
      mapped.company_domain = extractDomain(mapped.company_website as string)
    } else if (email) {
      mapped.company_domain = email.split('@')[1] || null
    }
  }

  // Leid full_name af
  if (!mapped.full_name && (mapped.first_name || mapped.last_name)) {
    mapped.full_name = `${mapped.first_name || ''} ${mapped.last_name || ''}`.trim() || null
  }

  return mapped
}

// ── Hoofdlogica ─────────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date()

  console.log(`\nBulk CSV Import`)
  console.log(`Bestand: ${basename(absolutePath)}`)
  console.log(`Bron:    ${source}`)
  if (listName) console.log(`Lijst:   ${listName}`)
  if (dryRun)   console.log(`Modus:   DRY RUN`)
  console.log('─'.repeat(50))

  // Lees CSV
  const raw = readFileSync(absolutePath, 'utf-8')
  const records: Record<string, string>[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  })

  console.log(`Rijen gelezen: ${records.length.toLocaleString()}`)
  if (records.length === 0) { console.log('Leeg bestand.'); process.exit(0) }

  // Kolom mapping
  const headers = Object.keys(records[0])
  const colMap = buildColumnMap(headers)

  console.log(`\nHerkende kolommen (${colMap.size}/${headers.length}):`)
  for (const [col, field] of colMap) {
    console.log(`  ${col.padEnd(35)} → ${field}`)
  }
  const unrecognized = headers.filter(h => !colMap.has(h))
  if (unrecognized.length > 0) {
    console.log(`Niet herkend: ${unrecognized.slice(0, 5).join(', ')}${unrecognized.length > 5 ? '...' : ''}`)
  }

  // Normaliseer rijen
  let skipped = 0
  const normalized: Record<string, unknown>[] = []
  for (const row of records) {
    const lead = normalizeRow(row, colMap, source, listName)
    if (lead) normalized.push(lead)
    else skipped++
  }

  console.log(`\nGeldig: ${normalized.length.toLocaleString()} | Overgeslagen (geen email/linkedin): ${skipped.toLocaleString()}`)

  if (dryRun) {
    console.log('\nDRY RUN — eerste 3 rijen:')
    normalized.slice(0, 3).forEach(r => console.log(JSON.stringify(r, null, 2)))
    process.exit(0)
  }

  if (normalized.length === 0) { console.log('Niets te importeren.'); process.exit(0) }

  // Importeer in batches
  console.log(`\nImporteren in batches van ${BATCH_SIZE}...`)
  let inserted = 0
  let failed = 0

  for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
    const batch = normalized.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(normalized.length / BATCH_SIZE)

    process.stdout.write(`  Batch ${batchNum}/${totalBatches}... `)

    // Email leads: upsert op email (update als al bestaat)
    const withEmail = batch.filter(r => r.email)
    if (withEmail.length > 0) {
      const { error } = await supabase
        .from('lead_pool')
        .upsert(withEmail, { onConflict: 'email', ignoreDuplicates: false })

      if (error) {
        console.error(`\nFout: ${error.message}`)
        failed += withEmail.length
      } else {
        inserted += withEmail.length
      }
    }

    // LinkedIn-only leads: insert (zonder email conflict check)
    const linkedinOnly = batch.filter(r => !r.email)
    if (linkedinOnly.length > 0) {
      const { error } = await supabase
        .from('lead_pool')
        .insert(linkedinOnly)

      if (error) {
        if (error.code !== '23505') console.error(`\nInsert fout: ${error.message}`)
        failed += linkedinOnly.length
      } else {
        inserted += linkedinOnly.length
      }
    }

    console.log('done')
  }

  const completedAt = new Date()
  const durationSec = ((completedAt.getTime() - startedAt.getTime()) / 1000).toFixed(1)

  console.log('\n' + '─'.repeat(50))
  console.log(`Klaar in ${durationSec}s`)
  console.log(`  Verwerkt:  ${normalized.length.toLocaleString()}`)
  console.log(`  Ingevoerd: ${inserted.toLocaleString()}`)
  console.log(`  Mislukt:   ${failed.toLocaleString()}`)

  // Log naar sync_log
  await supabase.from('sync_log').insert({
    source,
    table_name: 'lead_pool',
    operation: 'bulk_import',
    records_processed: normalized.length,
    records_created: inserted,
    records_failed: failed,
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    duration_ms: completedAt.getTime() - startedAt.getTime(),
  }).then(({ error }) => {
    if (error) console.error('Sync log fout:', error.message)
  })
}

main().catch(err => {
  console.error('Fatale fout:', err)
  process.exit(1)
})
