/**
 * Data Sourcing Pipeline
 * Volledige pipeline: A-Leads source → email waterfall → EmailBison push
 * Tracked via sourcing_runs in Supabase
 */

import { runWaterfallBatch } from './waterfall.ts';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? 'gjhbbyodrbuabfzafzry';
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;

export interface PipelineOptions {
  client_id: string;
  cell_id?: string;
  emailbison_campaign_id?: number;
  campaign_id?: string;
  sourcing_run_id?: string;  // bestaande run hervatten
  steps?: ('source' | 'waterfall' | 'push')[];  // default: alle stappen
  concurrency?: number;
  dry_run?: boolean;
}

export interface PipelineResult {
  sourcing_run_id: string;
  steps_completed: string[];
  contacts_sourced: number;
  contacts_found: number;
  contacts_pushed: number;
  duration_ms: number;
  error?: string;
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

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

async function callEdgeFunction(name: string, body: Record<string, unknown>): Promise<unknown> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`${name} ${resp.status}: ${text.substring(0, 200)}`);
  return JSON.parse(text);
}

// ── Sourcing run tracking ─────────────────────────────────────────────────────

async function createSourcingRun(clientId: string, cellId?: string): Promise<string> {
  const rows = await dbQuery(`
    INSERT INTO sourcing_runs (client_id, cell_id, run_type, status, started_at)
    VALUES ('${clientId}', ${cellId ? `'${cellId}'` : 'NULL'}, 'full', 'running', NOW())
    RETURNING id
  `) as { id: string }[];
  return rows[0].id;
}

async function updateSourcingRun(runId: string, fields: Record<string, unknown>): Promise<void> {
  const set = Object.entries(fields)
    .map(([k, v]) => `${k} = ${v === null ? 'NULL' : typeof v === 'string' ? `'${v}'` : v}`)
    .join(', ');
  await dbQuery(`UPDATE sourcing_runs SET ${set}, updated_at = NOW() WHERE id = '${runId}'`);
}

// ── Stap 1: A-Leads source ────────────────────────────────────────────────────

async function stepSource(
  clientId: string,
  cellId: string | undefined,
  runId: string,
  dryRun: boolean
): Promise<number> {
  console.log(`[pipeline] Stap 1: A-Leads source (cell=${cellId ?? 'geen'})`);

  const result = await callEdgeFunction('gtm-aleads-source', {
    client_id: clientId,
    cell_id: cellId,
    sourcing_run_id: runId,
    dry_run: dryRun,
  }) as { contacts_new?: number; contacts_found?: number; error?: string };

  if (result.error) throw new Error(`gtm-aleads-source fout: ${result.error}`);

  const sourced = result.contacts_new ?? result.contacts_found ?? 0;
  console.log(`[pipeline] A-Leads: ${sourced} nieuwe contacten`);

  await updateSourcingRun(runId, { contacts_found: sourced });
  return sourced;
}

// ── Stap 2: Email waterfall ───────────────────────────────────────────────────

async function stepWaterfall(
  clientId: string,
  runId: string,
  concurrency: number
): Promise<number> {
  console.log(`[pipeline] Stap 2: Email waterfall (concurrency=${concurrency})`);

  // Haal contacten op die via deze sourcing run zijn aangemaakt en nog geen email hebben
  const rows = await dbQuery(`
    SELECT DISTINCT c.id
    FROM contacts c
    JOIN sourcing_runs sr ON sr.id = '${runId}'
    WHERE c.client_id = sr.client_id
      AND c.email IS NULL
      AND c.first_name IS NOT NULL
      AND c.last_name IS NOT NULL
      AND c.created_at >= sr.started_at
    LIMIT 2000
  `) as { id: string }[];

  if (rows.length === 0) {
    console.log('[pipeline] Geen nieuwe contacten zonder email — waterfall overgeslagen');
    return 0;
  }

  console.log(`[pipeline] Waterfall op ${rows.length} contacten`);
  const stats = await runWaterfallBatch({
    client_id: clientId,
    contact_ids: rows.map(r => r.id),
    concurrency,
  });

  console.log(`[pipeline] Waterfall klaar: found=${stats.found} failed=${stats.failed}`);
  await updateSourcingRun(runId, {
    contacts_valid: stats.found,
    contacts_suppressed: stats.dnc,
  });

  return stats.found;
}

// ── Stap 3: EmailBison push ───────────────────────────────────────────────────

async function stepPush(
  clientId: string,
  ebCampaignId: number,
  campaignId: string | undefined,
  cellId: string | undefined,
  runId: string,
  dryRun: boolean
): Promise<number> {
  console.log(`[pipeline] Stap 3: EmailBison push (campaign=${ebCampaignId})`);

  const result = await callEdgeFunction('emailbison-pusher', {
    client_id: clientId,
    emailbison_campaign_id: ebCampaignId,
    campaign_id: campaignId,
    cell_id: cellId,
    sourcing_run_id: runId,
    dry_run: dryRun,
  }) as { pushed?: number; skipped?: number; error?: string };

  if (result.error) throw new Error(`emailbison-pusher fout: ${result.error}`);

  const pushed = result.pushed ?? 0;
  console.log(`[pipeline] EmailBison: ${pushed} contacten gepushed`);

  await updateSourcingRun(runId, { contacts_pushed: pushed });
  return pushed;
}

// ── Hoofd pipeline ────────────────────────────────────────────────────────────

export async function runPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const {
    client_id,
    cell_id,
    emailbison_campaign_id,
    campaign_id,
    steps = ['source', 'waterfall', 'push'],
    concurrency = 5,
    dry_run = false,
  } = opts;

  const start = Date.now();
  const stepsCompleted: string[] = [];
  let sourcing_run_id = opts.sourcing_run_id ?? '';
  let contactsSourced = 0;
  let contactsFound = 0;
  let contactsPushed = 0;

  console.log(`[pipeline] Start — client=${client_id} steps=${steps.join('+')} dry=${dry_run}`);

  try {
    // Sourcing run aanmaken (of hervatten)
    if (!sourcing_run_id) {
      sourcing_run_id = await createSourcingRun(client_id, cell_id);
      console.log(`[pipeline] Sourcing run: ${sourcing_run_id}`);
    }

    // Stap 1: Source
    if (steps.includes('source')) {
      contactsSourced = await stepSource(client_id, cell_id, sourcing_run_id, dry_run);
      stepsCompleted.push('source');
    }

    // Stap 2: Waterfall
    if (steps.includes('waterfall')) {
      contactsFound = await stepWaterfall(client_id, sourcing_run_id, concurrency);
      stepsCompleted.push('waterfall');
    }

    // Stap 3: Push
    if (steps.includes('push') && emailbison_campaign_id) {
      contactsPushed = await stepPush(
        client_id, emailbison_campaign_id, campaign_id, cell_id, sourcing_run_id, dry_run
      );
      stepsCompleted.push('push');
    } else if (steps.includes('push') && !emailbison_campaign_id) {
      console.log('[pipeline] Push overgeslagen — geen emailbison_campaign_id opgegeven');
    }

    await updateSourcingRun(sourcing_run_id, {
      status: 'completed',
      completed_at: 'NOW()',
    });

    const result: PipelineResult = {
      sourcing_run_id,
      steps_completed: stepsCompleted,
      contacts_sourced: contactsSourced,
      contacts_found: contactsFound,
      contacts_pushed: contactsPushed,
      duration_ms: Date.now() - start,
    };

    console.log(`[pipeline] Klaar — ${JSON.stringify(result)}`);
    return result;

  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[pipeline] FOUT: ${msg}`);

    if (sourcing_run_id) {
      await updateSourcingRun(sourcing_run_id, { status: 'failed' }).catch(() => {});
    }

    return {
      sourcing_run_id,
      steps_completed: stepsCompleted,
      contacts_sourced: contactsSourced,
      contacts_found: contactsFound,
      contacts_pushed: contactsPushed,
      duration_ms: Date.now() - start,
      error: msg,
    };
  }
}
