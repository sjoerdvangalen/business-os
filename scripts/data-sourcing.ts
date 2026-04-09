#!/usr/bin/env bun
/**
 * Data Sourcing CLI
 *
 * Usage:
 *   bun run scripts/data-sourcing.ts <command> [options]
 *
 * Commands:
 *   source    --client FRTC [--limit 500]           A-Leads sourcing (via gtm-aleads-source)
 *   validate  --client FRTC [--batch 100]           Enrow validatie (via validate-leads)
 *   push      --client FRTC --eb-campaign 123 [--campaign-id uuid]  EmailBison push
 *   pipeline  --client FRTC --eb-campaign 123 [--campaign-id uuid]  Volledig: source → validate → push
 *   dnc       check  --email test@example.com [--client FRTC]
 *   dnc       add    --email x@y.com --reason hard_bounce [--client FRTC] [--days 90]
 *   dnc       list   [--client FRTC] [--limit 50]
 *   runs      list   [--client FRTC] [--limit 10]
 *   runs      show   --run-id <uuid>
 */

import { createClient } from '@supabase/supabase-js';

// Load env
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.error('Run: source ~/.claude/scripts/load-env.sh');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Parse CLI args
const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1]?.startsWith('--') ? undefined : args[1];

function getFlag(flag: string): string | undefined {
  const idx = args.indexOf(`--${flag}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}

function hasFlag(flag: string): boolean {
  return args.includes(`--${flag}`);
}

async function getClientId(code: string): Promise<string> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name')
    .eq('client_code', code.toUpperCase())
    .single();
  if (error || !data) {
    console.error(`Client not found: ${code}`);
    process.exit(1);
  }
  console.log(`Client: ${data.name} (${data.id})`);
  return data.id;
}

async function invokeFunction(name: string, payload: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`${name} error ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// --- Commands ---

async function cmdSource() {
  const clientCode = getFlag('client');
  if (!clientCode) { console.error('--client required'); process.exit(1); }
  const clientId = await getClientId(clientCode);
  const dryRun = hasFlag('dry-run');

  console.log(`\nStarting A-Leads sourcing for ${clientCode}...`);
  const result = await invokeFunction('gtm-aleads-source', { client_id: clientId, dry_run: dryRun });
  console.log(JSON.stringify(result, null, 2));
}

async function cmdValidate() {
  const clientCode = getFlag('client');
  if (!clientCode) { console.error('--client required'); process.exit(1); }
  const clientId = await getClientId(clientCode);
  const batchSize = parseInt(getFlag('batch') || '100');
  const dryRun = hasFlag('dry-run');

  console.log(`\nRunning Enrow validation for ${clientCode} (batch: ${batchSize})...`);
  const result = await invokeFunction('validate-leads', {
    client_id: clientId,
    batch_size: batchSize,
    dry_run: dryRun,
  });
  console.log(JSON.stringify(result, null, 2));
}

async function cmdPush() {
  const clientCode = getFlag('client');
  const ebCampaign = getFlag('eb-campaign');
  if (!clientCode || !ebCampaign) { console.error('--client and --eb-campaign required'); process.exit(1); }
  const clientId = await getClientId(clientCode);
  const campaignId = getFlag('campaign-id');
  const dryRun = hasFlag('dry-run');

  console.log(`\nPushing to EmailBison campaign ${ebCampaign}...`);
  const result = await invokeFunction('emailbison-pusher', {
    client_id: clientId,
    emailbison_campaign_id: parseInt(ebCampaign),
    campaign_id: campaignId || null,
    dry_run: dryRun,
  });
  console.log(JSON.stringify(result, null, 2));
}

async function cmdPipeline() {
  const clientCode = getFlag('client');
  const ebCampaign = getFlag('eb-campaign');
  if (!clientCode || !ebCampaign) { console.error('--client and --eb-campaign required'); process.exit(1); }
  const clientId = await getClientId(clientCode);
  const campaignId = getFlag('campaign-id');
  const cellId = getFlag('cell-id');
  const stepsArg = getFlag('steps');
  const steps = stepsArg ? stepsArg.split(',') : ['source', 'validate', 'push'];
  const dryRun = hasFlag('dry-run');

  console.log(`\nRunning full sourcing pipeline for ${clientCode}...`);
  console.log(`Steps: ${steps.join(' → ')}`);
  if (dryRun) console.log('DRY RUN — no writes');

  const result = await invokeFunction('data-sourcing-orchestrator', {
    client_id: clientId,
    emailbison_campaign_id: parseInt(ebCampaign),
    campaign_id: campaignId || null,
    cell_id: cellId || null,
    steps,
    dry_run: dryRun,
  });
  console.log(JSON.stringify(result, null, 2));
}

async function cmdDncCheck() {
  const email = getFlag('email');
  if (!email) { console.error('--email required'); process.exit(1); }
  const clientCode = getFlag('client');
  const clientId = clientCode ? await getClientId(clientCode) : null;

  const now = new Date().toISOString();
  let query = supabase
    .from('dnc_entities')
    .select('entity_type, entity_value, reason, expires_at, created_at')
    .or(`expires_at.is.null,expires_at.gt.${now}`);

  if (clientId) {
    query = query.or(`client_id.is.null,client_id.eq.${clientId}`);
  }

  const domain = email.split('@')[1];
  const { data } = await query.in('entity_value', [email.toLowerCase(), domain?.toLowerCase()].filter(Boolean));

  if (!data || data.length === 0) {
    console.log(`\n${email} — CLEAN (not in DNC)`);
  } else {
    console.log(`\n${email} — SUPPRESSED:`);
    for (const row of data) {
      const expires = row.expires_at ? `expires ${row.expires_at.slice(0, 10)}` : 'permanent';
      console.log(`  ${row.entity_type}=${row.entity_value}  reason=${row.reason}  ${expires}`);
    }
  }
}

async function cmdDncAdd() {
  const email = getFlag('email');
  const reason = getFlag('reason') || 'manual';
  if (!email) { console.error('--email required'); process.exit(1); }
  const clientCode = getFlag('client');
  const clientId = clientCode ? await getClientId(clientCode) : null;
  const days = getFlag('days');
  const expiresAt = days ? new Date(Date.now() + parseInt(days) * 86400000).toISOString() : null;

  const { error } = await supabase.from('dnc_entities').upsert({
    client_id: clientId,
    entity_type: 'email',
    entity_value: email.toLowerCase(),
    reason,
    source: 'cli',
    expires_at: expiresAt,
  }, { onConflict: 'client_id,entity_type,entity_value' });

  if (error) {
    console.error('DNC add failed:', error.message);
    process.exit(1);
  }
  const scope = clientId ? `client` : 'global';
  console.log(`\nAdded to DNC: ${email}  reason=${reason}  scope=${scope}${expiresAt ? `  expires=${expiresAt.slice(0, 10)}` : ' (permanent)'}`);
}

async function cmdDncList() {
  const clientCode = getFlag('client');
  const clientId = clientCode ? await getClientId(clientCode) : null;
  const limit = parseInt(getFlag('limit') || '50');

  const now = new Date().toISOString();
  let query = supabase
    .from('dnc_entities')
    .select('entity_type, entity_value, reason, source, expires_at, created_at')
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (clientId) {
    query = query.or(`client_id.is.null,client_id.eq.${clientId}`);
  } else {
    query = query.is('client_id', null);
  }

  const { data, error } = await query;
  if (error) { console.error(error.message); process.exit(1); }

  console.log(`\nDNC entries (${data?.length || 0}):`);
  for (const row of data || []) {
    const expires = row.expires_at ? row.expires_at.slice(0, 10) : 'permanent';
    console.log(`  ${row.entity_type.padEnd(12)} ${row.entity_value.padEnd(40)} ${row.reason.padEnd(20)} ${expires}`);
  }
}

async function cmdRunsList() {
  const clientCode = getFlag('client');
  const clientId = clientCode ? await getClientId(clientCode) : null;
  const limit = parseInt(getFlag('limit') || '10');

  let query = supabase
    .from('sourcing_runs')
    .select('id, run_type, status, contacts_found, contacts_valid, contacts_pushed, started_at, completed_at')
    .order('started_at', { ascending: false })
    .limit(limit);

  if (clientId) query = query.eq('client_id', clientId);

  const { data, error } = await query;
  if (error) { console.error(error.message); process.exit(1); }

  console.log(`\nSourcing runs (${data?.length || 0}):`);
  for (const row of data || []) {
    const duration = row.completed_at
      ? `${Math.round((new Date(row.completed_at).getTime() - new Date(row.started_at).getTime()) / 1000)}s`
      : 'running';
    console.log(`  ${row.id.slice(0, 8)}  ${row.run_type.padEnd(20)} ${row.status.padEnd(12)} found=${row.contacts_found} valid=${row.contacts_valid} pushed=${row.contacts_pushed}  ${duration}`);
  }
}

async function cmdRunsShow() {
  const runId = getFlag('run-id');
  if (!runId) { console.error('--run-id required'); process.exit(1); }

  const { data, error } = await supabase
    .from('sourcing_runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (error || !data) { console.error('Run not found'); process.exit(1); }
  console.log(JSON.stringify(data, null, 2));
}

// --- Router ---

const help = `
Data Sourcing CLI

Commands:
  source    --client CODE [--dry-run]
  validate  --client CODE [--batch N] [--dry-run]
  push      --client CODE --eb-campaign N [--campaign-id UUID] [--dry-run]
  pipeline  --client CODE --eb-campaign N [--campaign-id UUID] [--cell-id UUID] [--steps source,validate,push] [--dry-run]
  dnc check   --email EMAIL [--client CODE]
  dnc add     --email EMAIL --reason REASON [--client CODE] [--days N]
  dnc list    [--client CODE] [--limit N]
  runs list   [--client CODE] [--limit N]
  runs show   --run-id UUID
`;

switch (command) {
  case 'source':   await cmdSource(); break;
  case 'validate': await cmdValidate(); break;
  case 'push':     await cmdPush(); break;
  case 'pipeline': await cmdPipeline(); break;
  case 'dnc':
    switch (subcommand) {
      case 'check': await cmdDncCheck(); break;
      case 'add':   await cmdDncAdd(); break;
      case 'list':  await cmdDncList(); break;
      default: console.log(help);
    }
    break;
  case 'runs':
    switch (subcommand) {
      case 'list': await cmdRunsList(); break;
      case 'show': await cmdRunsShow(); break;
      default: console.log(help);
    }
    break;
  default:
    console.log(help);
}
