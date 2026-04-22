/**
 * Waterfall batch job
 * Haalt contacts zonder email op uit Supabase en verwerkt ze via waterfallContact() (direct, geen HTTP hop)
 */

import { waterfallContact } from './waterfall-core.ts';

const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;
const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? 'gjhbbyodrbuabfzafzry';

interface WaterfallOptions {
  client_id?: string;
  contact_ids?: string[];
  concurrency?: number;
}

interface WaterfallStats {
  total: number;
  found: number;
  failed: number;
  errors: number;
  dnc: number;
  duration_ms: number;
}

async function dbQuery(query: string): Promise<unknown[]> {
  const resp = await fetch(
    `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    }
  );
  if (!resp.ok) throw new Error(`DB query failed: ${await resp.text()}`);
  return resp.json() as Promise<unknown[]>;
}

async function withConcurrency<T>(
  items: T[],
  fn: (item: T, i: number) => Promise<void>,
  concurrency: number
): Promise<void> {
  let idx = 0;
  const worker = async () => {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

export async function runWaterfallBatch(opts: WaterfallOptions): Promise<WaterfallStats> {
  const { client_id, contact_ids, concurrency = 5 } = opts;
  const start = Date.now();

  let ids: string[];

  if (contact_ids && contact_ids.length > 0) {
    ids = contact_ids;
  } else {
    const where = client_id
      ? `WHERE client_id = '${client_id}' AND email IS NULL`
      : `WHERE email IS NULL`;
    const rows = await dbQuery(
      `SELECT id FROM contacts ${where} ORDER BY created_at DESC LIMIT 1000`
    ) as { id: string }[];
    ids = rows.map(r => r.id);
  }

  console.log(`[waterfall] Processing ${ids.length} contacts (concurrency=${concurrency})`);

  const stats: WaterfallStats = { total: ids.length, found: 0, failed: 0, errors: 0, dnc: 0, duration_ms: 0 };

  await withConcurrency(ids, async (id, i) => {
    try {
      const result = await waterfallContact(id, client_id);
      if (result.email) {
        stats.found++;
        console.log(`[${i + 1}/${ids.length}] FOUND  ${result.email}  (${result.source})`);
      } else if (result.source?.startsWith('dnc')) {
        stats.dnc++;
      } else {
        stats.failed++;
      }
    } catch (err) {
      stats.errors++;
      console.error(`[${i + 1}/${ids.length}] ERR  ${(err as Error).message}`);
    }
  }, concurrency);

  stats.duration_ms = Date.now() - start;
  console.log(`[waterfall] Done — found=${stats.found} failed=${stats.failed} errors=${stats.errors} time=${(stats.duration_ms / 1000).toFixed(1)}s`);
  return stats;
}
