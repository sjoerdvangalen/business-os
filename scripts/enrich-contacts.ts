#!/usr/bin/env -S bun run
/**
 * enrich-contacts.ts
 *
 * AI-enrich contacts voor een client/cell via de ai-enrich-contact edge function.
 *
 * Gebruik:
 *   bun run scripts/enrich-contacts.ts --client ZONC --cell-id <uuid> --limit 20 --dry-run
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Vereist: SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function getArg(argv: string[], flag: string): string | null {
  const idx = argv.indexOf(flag)
  return idx !== -1 && idx + 1 < argv.length ? argv[idx + 1] : null
}

async function main() {
  const args = process.argv.slice(2)
  const clientCode = getArg(args, '--client') || ''
  const cellId = getArg(args, '--cell-id') || ''
  const limit = parseInt(getArg(args, '--limit') || '20', 10)
  const dryRun = args.includes('--dry-run')

  if (!clientCode) {
    console.error('Usage: bun run scripts/enrich-contacts.ts --client <CODE> [--cell-id <uuid>] [--limit 20] [--dry-run]')
    process.exit(1)
  }

  // Resolve client
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, name, client_code')
    .eq('client_code', clientCode.toUpperCase())
    .single()

  if (clientError || !client) {
    console.error(`Client not found: ${clientCode}`)
    process.exit(1)
  }

  console.log(`Client: ${client.name} (${client.client_code})`)
  if (cellId) console.log(`Cell: ${cellId}`)
  console.log(`Limit: ${limit}`)
  if (dryRun) console.log('DRY RUN — no API calls\n')

  // Fetch contacts to enrich
  const { data: contacts, error: contactsError } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, email, enriched_at')
    .eq('client_id', client.id)
    .not('email', 'is', null)
    .or(`enriched_at.is.null,enriched_at.lt.${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()}`)
    .limit(limit)

  if (contactsError) {
    console.error('Failed to fetch contacts:', contactsError.message)
    process.exit(1)
  }

  if (!contacts || contacts.length === 0) {
    console.log('No contacts to enrich.')
    return
  }

  console.log(`Found ${contacts.length} contacts to enrich\n`)

  let enriched = 0
  let failed = 0

  for (const contact of contacts) {
    if (dryRun) {
      console.log(`[dry-run] Would enrich ${contact.id} | ${contact.first_name || ''} ${contact.last_name || ''}`)
      enriched++
      continue
    }

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-enrich-contact`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contact_id: contact.id,
          cell_id: cellId || undefined,
        }),
      })

      if (res.ok) {
        enriched++
        console.log(`Enriched ${contact.id} | ${contact.first_name || ''} ${contact.last_name || ''}`)
      } else {
        failed++
        const err = await res.text()
        console.error(`Failed ${contact.id}: ${res.status} ${err.slice(0, 100)}`)
      }
    } catch (err) {
      failed++
      console.error(`Error ${contact.id}:`, (err as Error).message)
    }
  }

  console.log(`\nDone: ${enriched} enriched, ${failed} failed`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
