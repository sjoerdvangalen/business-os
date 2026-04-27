#!/usr/bin/env -S bun run
/**
 * export-to-spreadsheet.ts
 *
 * Exporteer contacts uit Supabase naar CSV/XLSX.
 *
 * Gebruik:
 *   bun run scripts/export-to-spreadsheet.ts --source clay --since 2026-04-21
 *   bun run scripts/export-to-spreadsheet.ts --contact-ids id1,id2,id3
 *   bun run scripts/export-to-spreadsheet.ts --client SECX --campaign "SECX | EN | Test"
 */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve } from 'path'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Vereist: SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const args = process.argv.slice(2)

function getArg(flag: string): string | null {
  const idx = args.indexOf(flag)
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null
}

const sourceArg     = getArg('--source') || null
const sinceArg      = getArg('--since') || null
const contactIdsArg = getArg('--contact-ids')
const clientCode    = getArg('--client') || null
const campaignName  = getArg('--campaign') || null
const outDir        = resolve(getArg('--out') || 'scripts/output')

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

interface ExportRow {
  first_name: string | null
  last_name: string | null
  email: string | null
  title: string | null
  linkedin_url: string | null
  email_verified: boolean | null
  email_catchall: boolean | null
  company_name: string | null
  company_domain: string | null
  company_website: string | null
  company_industry: string | null
  source: string | null
  created_at: string | null
}

function escapeCsv(val: unknown): string {
  const str = String(val ?? '')
  return `"${str.replace(/"/g, '""')}"`
}

async function main() {
  let clientId: string | null = null

  if (clientCode) {
    const { data } = await supabase
      .from('clients')
      .select('id')
      .eq('client_code', clientCode.toUpperCase())
      .single()
    if (data) clientId = data.id
  }

  let query = supabase
    .from('contacts')
    .select('first_name, last_name, email, title, linkedin_url, email_verified, email_catchall, source, created_at, companies(name, domain, website, industry)')

  if (contactIdsArg) {
    const ids = contactIdsArg.split(',').map(s => s.trim()).filter(Boolean)
    query = query.in('id', ids)
  } else {
    if (clientId) query = query.eq('client_id', clientId)
    if (sourceArg) query = query.eq('source', sourceArg)
    if (sinceArg) query = query.gte('created_at', sinceArg)
  }

  const { data: rows, error } = await query.limit(10000)

  if (error) {
    console.error('Query error:', error.message)
    process.exit(1)
  }

  if (!rows || rows.length === 0) {
    console.log('Geen contacts gevonden voor deze criteria.')
    process.exit(0)
  }

  const lines: string[] = []
  lines.push('first_name,last_name,email,title,linkedin_url,email_verified,email_catchall,company_name,company_domain,company_website,company_industry,source,created_at')

  for (const r of rows as any[]) {
    const c = r.companies as any
    const out: ExportRow = {
      first_name: r.first_name,
      last_name: r.last_name,
      email: r.email,
      title: r.title,
      linkedin_url: r.linkedin_url,
      email_verified: r.email_verified,
      email_catchall: r.email_catchall,
      company_name: c?.name ?? null,
      company_domain: c?.domain ?? null,
      company_website: c?.website ?? null,
      company_industry: c?.industry ?? null,
      source: r.source,
      created_at: r.created_at,
    }

    lines.push([
      out.first_name, out.last_name, out.email, out.title,
      out.linkedin_url, out.email_verified, out.email_catchall,
      out.company_name, out.company_domain, out.company_website,
      out.company_industry, out.source, out.created_at,
    ].map(escapeCsv).join(','))
  }

  const fileName = campaignName
    ? `${campaignName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')}-${new Date().toISOString().slice(0, 10)}.csv`
    : `export-${new Date().toISOString().slice(0, 10)}.csv`

  const outPath = resolve(outDir, fileName)
  writeFileSync(outPath, lines.join('\n'), 'utf-8')

  console.log(`Exported ${rows.length} contacts to ${outPath}`)
}

main().catch(err => {
  console.error('Fatale fout:', err)
  process.exit(1)
})
