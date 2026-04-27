/**
 * Sync EmailBison inboxes to Supabase
 * Fetches all sender emails + warmup data from EmailBison API,
 * matches with existing email_inboxes, and batch upserts.
 */

import { createClient } from '@supabase/supabase-js';

const EMAIL_BISON_API_KEY = process.env.EMAIL_BISON_API_KEY!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface EmailBisonSender {
  id: number;
  email: string;
  name: string;
  status: string;
  daily_limit: number;
  warmup_enabled: boolean;
}

interface WarmupRecord {
  id: number;
  email: string;
  warmup_score: number | null;
  warmup_emails_sent: number | null;
}

interface SyncResult {
  total_emailbison: number;
  existing_supabase: number;
  merged: number;
  created: number;
  failed: number;
  disconnected_detected: number;
  duration_ms: number;
}

async function fetchAllPages<T>(baseUrl: string, apiKey: string): Promise<T[]> {
  const allData: T[] = [];
  let url: string | null = baseUrl;
  let pageCount = 0;

  while (url) {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`EmailBison API error ${resp.status}: ${text}`);
    }
    const data = await resp.json() as { data: T[]; links?: { next?: string | null } };
    allData.push(...(data.data || []));
    url = data.links?.next || null;
    pageCount++;
    if (pageCount > 100) {
      console.warn('[sync-inboxes] Pagination limit reached');
      break;
    }
  }
  return allData;
}

async function upsertBatch(
  supabase: ReturnType<typeof createClient>,
  rows: Record<string, unknown>[],
  attempt = 1
): Promise<{ success: boolean; count: number; error?: string }> {
  const { data, error } = await supabase.from('email_inboxes').upsert(rows, {
    onConflict: 'email',
    ignoreDuplicates: false,
  });

  if (error) {
    console.error(`[sync-inboxes] Batch upsert error (attempt ${attempt}):`, error.message);
    if (attempt < 3 && error.message.includes('deadlock')) {
      await new Promise(r => setTimeout(r, 500 * attempt));
      return upsertBatch(supabase, rows, attempt + 1);
    }
    return { success: false, count: 0, error: error.message };
  }

  return { success: true, count: rows.length };
}

export async function runSyncInboxes(): Promise<SyncResult> {
  const start = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Fetch all EmailBison sender emails
  console.log('[sync-inboxes] Fetching sender emails from EmailBison...');
  const senderEmails = await fetchAllPages<EmailBisonSender>(
    'https://mail.scaleyourleads.com/api/sender-emails',
    EMAIL_BISON_API_KEY
  );
  console.log(`[sync-inboxes] Fetched ${senderEmails.length} sender emails`);

  // 2. Fetch warmup data
  console.log('[sync-inboxes] Fetching warmup data...');
  const warmupData = await fetchAllPages<WarmupRecord>(
    'https://mail.scaleyourleads.com/api/warmup/sender-emails',
    EMAIL_BISON_API_KEY
  );
  console.log(`[sync-inboxes] Fetched ${warmupData.length} warmup records`);

  // 3. Build warmup lookup
  const warmupMap = new Map<number, { score: number | null; sent: number | null }>();
  for (const w of warmupData) {
    warmupMap.set(w.id, { score: w.warmup_score ?? null, sent: w.warmup_emails_sent ?? null });
  }

  // 4. Fetch existing inboxes from Supabase (all columns needed for merge)
  console.log('[sync-inboxes] Loading existing inboxes from Supabase...');
  const { data: existingInboxes, error: existingError } = await supabase
    .from('email_inboxes')
    .select('id, email, client_id, domain_id, provider');

  if (existingError) {
    throw new Error(`Failed to load existing inboxes: ${existingError.message}`);
  }

  const existingMap = new Map<string, { id: string; client_id: string | null; domain_id: string | null; provider: string | null }>();
  for (const inbox of existingInboxes || []) {
    if (inbox.email) {
      existingMap.set(inbox.email.toLowerCase(), inbox);
    }
  }
  console.log(`[sync-inboxes] Loaded ${existingMap.size} existing inboxes`);

  // 5. Collect domain list for lookup
  const allDomains = new Set<string>();
  for (const acct of senderEmails) {
    const domain = acct.email?.split('@')[1]?.toLowerCase() || '';
    if (domain) allDomains.add(domain);
  }

  // 6. Fetch domain IDs
  const { data: domainRows } = await supabase
    .from('domains')
    .select('id, domain')
    .in('domain', Array.from(allDomains));

  const domainMap = new Map<string, string>();
  for (const d of domainRows || []) {
    domainMap.set(d.domain, d.id);
  }

  // 7. Build upsert rows
  const now = new Date().toISOString();
  const rowsToUpsert: Record<string, unknown>[] = [];
  let merged = 0;
  let created = 0;
  let disconnectedDetected = 0;

  for (const acct of senderEmails) {
    const email = acct.email?.toLowerCase() || '';
    const warmup = warmupMap.get(acct.id);
    const existing = existingMap.get(email);
    const emailDomain = email.split('@')[1] || '';

    if (existing) {
      // Merge: keep existing client_id/domain_id, update EmailBison data
      const isDisconnected = acct.status === 'disconnected' || acct.status === 'expired';
      if (isDisconnected) disconnectedDetected++;

      rowsToUpsert.push({
        id: existing.id,
        email: acct.email,
        provider_inbox_id: String(acct.id),
        status: acct.status || existing.status,
        daily_limit: acct.daily_limit || existing.daily_limit,
        warmup_status: acct.warmup_enabled ? 'enabled' : 'disabled',
        warmup_emails_sent_today: warmup?.sent || 0,
        overall_warmup_health: warmup?.score ?? existing.overall_warmup_health,
        last_synced_at: now,
      });
      merged++;
    } else {
      // New inbox
      const nameParts = acct.name?.trim().split(' ') || [''];
      rowsToUpsert.push({
        email: acct.email,
        provider: 'emailbison',
        provider_inbox_id: String(acct.id),
        client_id: null,
        domain_id: domainMap.get(emailDomain) || null,
        first_name: nameParts[0] || null,
        last_name: nameParts.slice(1).join(' ') || null,
        status: acct.status || 'active',
        daily_limit: acct.daily_limit || null,
        emails_sent_today: 0,
        warmup_status: acct.warmup_enabled ? 'enabled' : 'disabled',
        warmup_emails_sent_today: warmup?.sent || 0,
        overall_warmup_health: warmup?.score ?? null,
        last_synced_at: now,
      });
      created++;
    }
  }

  // 8. Batch upsert in chunks of 100
  console.log(`[sync-inboxes] Upserting ${rowsToUpsert.length} rows in batches...`);
  const BATCH_SIZE = 100;
  let failed = 0;
  let upsertedCount = 0;

  for (let i = 0; i < rowsToUpsert.length; i += BATCH_SIZE) {
    const batch = rowsToUpsert.slice(i, i + BATCH_SIZE);
    const result = await upsertBatch(supabase, batch);
    if (result.success) {
      upsertedCount += result.count;
    } else {
      failed += batch.length;
    }
    if (i % 500 === 0) {
      console.log(`[sync-inboxes] Progress: ${Math.min(i + BATCH_SIZE, rowsToUpsert.length)}/${rowsToUpsert.length}`);
    }
  }

  // 9. Log to sync_log
  const duration = Date.now() - start;
  await supabase.from('sync_log').insert({
    source: 'emailbison',
    table_name: 'email_inboxes',
    operation: 'full_sync',
    records_processed: senderEmails.length,
    records_created: created,
    records_updated: merged,
    records_failed: failed,
    started_at: new Date(start).toISOString(),
    completed_at: new Date().toISOString(),
    duration_ms: duration,
  });

  // 10. Create alerts for disconnected inboxes (only new ones, not duplicates)
  if (disconnectedDetected > 0) {
    console.log(`[sync-inboxes] ${disconnectedDetected} disconnected inboxes detected`);
    // Note: alerts are already created by webhook-emailbison for real-time disconnections
    // We skip duplicate alert creation here to avoid spam
  }

  console.log(`[sync-inboxes] Done: total=${senderEmails.length}, merged=${merged}, created=${created}, failed=${failed}, duration=${duration}ms`);

  return {
    total_emailbison: senderEmails.length,
    existing_supabase: existingMap.size,
    merged,
    created,
    failed,
    disconnected_detected: disconnectedDetected,
    duration_ms: duration,
  };
}
