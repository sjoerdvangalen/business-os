/**
 * Batch email-waterfall voor SentioCX — 607 contacts zonder email
 * Flow per contact: 5 Enrow patterns → TryKitt search → Enrow search → Omni confirm
 *
 * Usage: bun run scripts/run-waterfall-sentio.ts [--dry-run] [--concurrency 5]
 */

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RAILWAY_BATCH_WORKER_URL = process.env.RAILWAY_BATCH_WORKER_URL;
const CLIENT_ID = 'e0c5ea2c-f945-4ab5-a159-32b9dccdb9c5'; // SentioCX

if (!RAILWAY_BATCH_WORKER_URL) {
  console.error('Missing RAILWAY_BATCH_WORKER_URL env var');
  process.exit(1);
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const CONCURRENCY = (() => {
  const idx = args.indexOf('--concurrency');
  return idx !== -1 ? parseInt(args[idx + 1]) : 5;
})();

async function supabaseQuery(query: string): Promise<unknown[]> {
  const resp = await fetch(
    `https://api.supabase.com/v1/projects/gjhbbyodrbuabfzafzry/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    }
  );
  if (!resp.ok) throw new Error(`DB query failed: ${await resp.text()}`);
  return resp.json() as Promise<unknown[]>;
}

async function runWaterfall(contactId: string): Promise<{ email: string | null; source: string }> {
  const resp = await fetch(`${RAILWAY_BATCH_WORKER_URL}/waterfall`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ contact_ids: [contactId], client_id: CLIENT_ID, concurrency: 1 }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`waterfall ${resp.status}: ${text.substring(0, 100)}`);
  }
  const data = await resp.json() as { found: number; failed: number; errors: number; dnc: number };
  return { email: data.found > 0 ? 'found' : null, source: data.found > 0 ? 'railway_batch' : data.dnc > 0 ? 'dnc' : 'failed' };
}

async function runWithConcurrency<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void>,
  concurrency: number
): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

async function main() {
  console.log(`SentioCX email waterfall — concurrency=${CONCURRENCY} dry_run=${DRY_RUN}`);

  // Fetch all contacts without email
  const rows = await supabaseQuery(
    `SELECT id FROM contacts WHERE client_id = '${CLIENT_ID}' AND email IS NULL ORDER BY id`
  ) as { id: string }[];

  console.log(`Found ${rows.length} contacts without email\n`);

  if (DRY_RUN) {
    console.log(`Dry run — would process ${rows.length} contacts`);
    return;
  }

  const stats = { found: 0, failed: 0, errors: 0, dnc: 0 };
  const startTime = Date.now();

  await runWithConcurrency(rows, async (row, i) => {
    try {
      const result = await runWaterfall(row.id);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

      if (result.email) {
        stats.found++;
        console.log(`[${i + 1}/${rows.length}] +${elapsed}s  FOUND  ${result.email}  (${result.source})`);
      } else if (result.source?.startsWith('dnc')) {
        stats.dnc++;
        console.log(`[${i + 1}/${rows.length}] +${elapsed}s  DNC    ${result.source}`);
      } else {
        stats.failed++;
        console.log(`[${i + 1}/${rows.length}] +${elapsed}s  -      ${result.source}`);
      }
    } catch (err) {
      stats.errors++;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.error(`[${i + 1}/${rows.length}] +${elapsed}s  ERR    ${(err as Error).message}`);
    }
  }, CONCURRENCY);

  const total = Date.now() - startTime;
  console.log(`\nDone in ${(total / 1000).toFixed(1)}s`);
  console.log(`  Found:  ${stats.found}`);
  console.log(`  Failed: ${stats.failed}`);
  console.log(`  DNC:    ${stats.dnc}`);
  console.log(`  Errors: ${stats.errors}`);
  console.log(`  Total:  ${rows.length}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
