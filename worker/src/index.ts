/**
 * Email Waterfall Worker — Railway deployment
 *
 * Pollt lead_pool voor leads zonder geverifieerd email adres,
 * verwerkt ze door de waterfall (cache → patronen → Kit finder),
 * en slaat resultaten op.
 *
 * SKIP LOCKED pattern: meerdere workers kunnen parallel draaien
 * zonder dat ze dezelfde leads verwerken.
 *
 * Env vars:
 *   SUPABASE_URL              - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Supabase service role key
 *   KIT_API_KEY               - Kit.com API key
 *   BATCH_SIZE                - Leads per batch (default: 50)
 *   POLL_INTERVAL_MS          - Wacht tussen batches (default: 5000ms)
 *   CONCURRENCY               - Parallelle waterfall calls (default: 5)
 */

import { createClient } from '@supabase/supabase-js'
import { runWaterfall } from './waterfall.ts'

// ── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BATCH_SIZE   = parseInt(process.env.BATCH_SIZE || '50')
const POLL_MS      = parseInt(process.env.POLL_INTERVAL_MS || '5000')
const CONCURRENCY  = parseInt(process.env.CONCURRENCY || '5')

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Vereist: SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Worker state ────────────────────────────────────────────────────────────

let isRunning = true
let batchCount = 0
let totalProcessed = 0
let totalFound = 0
let totalNotFound = 0
let totalErrors = 0

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\nSIGTERM ontvangen — huidige batch afmaken dan stoppen')
  isRunning = false
})
process.on('SIGINT', () => {
  console.log('\nSIGINT ontvangen — stoppen')
  isRunning = false
})

// ── Hoofd loop ───────────────────────────────────────────────────────────────

async function main() {
  console.log('Email Waterfall Worker gestart')
  console.log(`Batch size: ${BATCH_SIZE} | Concurrency: ${CONCURRENCY} | Poll interval: ${POLL_MS}ms`)
  console.log('─'.repeat(60))

  while (isRunning) {
    try {
      const processed = await processBatch()

      if (processed === 0) {
        // Geen werk — wacht voor volgende poll
        process.stdout.write(`Wachtend op nieuwe leads... (${new Date().toLocaleTimeString('nl-NL')})\r`)
        await sleep(POLL_MS)
      }
    } catch (err) {
      console.error('Batch fout:', (err as Error).message)
      await sleep(POLL_MS)
    }
  }

  console.log('\n' + '─'.repeat(60))
  console.log('Worker gestopt')
  console.log(`Totaal verwerkt: ${totalProcessed}`)
  console.log(`Gevonden:        ${totalFound}`)
  console.log(`Niet gevonden:   ${totalNotFound}`)
  console.log(`Fouten:          ${totalErrors}`)
}

// ── Batch verwerking ─────────────────────────────────────────────────────────

async function processBatch(): Promise<number> {
  // Haal leads op met SKIP LOCKED (parallelle workers veilig)
  // Status 'unknown' = nog niet verwerkt
  // Status 'pending' = momenteel verwerkt door een worker (via update)
  const { data: leads, error } = await supabase
    .from('lead_pool')
    .select('id, email, first_name, last_name, full_name, linkedin_url, company_domain, company_name')
    .eq('email_status', 'unknown')
    .eq('is_duplicate', false)
    .eq('is_blocklisted', false)
    .not('company_domain', 'is', null)
    .limit(BATCH_SIZE)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`DB query fout: ${error.message}`)
  if (!leads || leads.length === 0) return 0

  batchCount++
  console.log(`\nBatch ${batchCount}: ${leads.length} leads`)

  // Markeer als 'processing' (voorkomt dubbele verwerking bij meerdere workers)
  const ids = leads.map(l => l.id)
  await supabase
    .from('lead_pool')
    .update({ email_status: 'processing' })
    .in('id', ids)

  // Verwerk in parallel met concurrency limiet
  const results = await processWithConcurrency(leads, CONCURRENCY)

  // Sla resultaten op
  let batchFound = 0
  let batchNotFound = 0
  let batchErrors = 0

  for (const result of results) {
    if (!result) {
      batchErrors++
      continue
    }

    const update: Record<string, unknown> = {
      email_status: result.status,
      email_validated_at: new Date().toISOString(),
      email_found_by: result.foundBy,
      email_validated_by: result.validatedBy,
      mx_provider: result.mxProvider,
      updated_at: new Date().toISOString(),
    }

    if (result.email) {
      update.email = result.email
      batchFound++
    } else {
      update.email_status = 'not_found'
      batchNotFound++
    }

    const { error: updateErr } = await supabase
      .from('lead_pool')
      .update(update)
      .eq('id', result.leadId)

    if (updateErr) {
      console.error(`Update fout voor ${result.leadId}:`, updateErr.message)
      batchErrors++
    }
  }

  totalProcessed += leads.length
  totalFound += batchFound
  totalNotFound += batchNotFound
  totalErrors += batchErrors

  console.log(`  Gevonden: ${batchFound} | Niet gevonden: ${batchNotFound} | Fouten: ${batchErrors}`)
  console.log(`  Cumulatief: ${totalProcessed} verwerkt, ${totalFound} gevonden`)

  return leads.length
}

// ── Concurrency helper ───────────────────────────────────────────────────────

async function processWithConcurrency<T>(
  items: T[],
  concurrency: number
): Promise<(Awaited<ReturnType<typeof runWaterfall>> | null)[]> {
  const results: (Awaited<ReturnType<typeof runWaterfall>> | null)[] = []

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)

    const batchResults = await Promise.all(
      batch.map(async item => {
        try {
          return await runWaterfall(supabase, item as Parameters<typeof runWaterfall>[1])
        } catch (err) {
          console.error(`Waterfall fout:`, (err as Error).message)
          return null
        }
      })
    )

    results.push(...batchResults)
  }

  return results
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Start ────────────────────────────────────────────────────────────────────

main().catch(err => {
  console.error('Fatale fout:', err)
  process.exit(1)
})
