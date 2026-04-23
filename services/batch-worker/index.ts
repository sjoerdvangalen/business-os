/**
 * Business-OS Batch Worker
 * HTTP server op Railway — verwerkt batch jobs getriggerd via Supabase webhooks of directe calls
 *
 * Endpoints:
 *   POST /waterfall              — Email waterfall voor alle contacts zonder email (optioneel client_id filter)
 *   POST /waterfall/webhook      — Supabase DB webhook handler (nieuwe contact zonder email)
 *   POST /pipeline               — Volledige sourcing pipeline: source → waterfall → push
 *   POST /push                   — Losse EmailBison push
 *   POST /enrich                 — AI enrich contact
 *   POST /gmaps-batch            — Process Google Maps scraper batch
 *   POST /validate               — Validate leads (Enrow of OmniVerifier)
 *   POST /gtm/research           — Start Exa deep research voor een client
 *   POST /gtm/research/poll      — Poll pending Exa research tasks
 *   POST /gtm/synthesis          — Synthesize research + form naar GTM strategy
 *   POST /gtm/doc-render         — Google Docs render (internal/external/demo)
 *   POST /gtm/execution-review   — Keyword profiles + A-Leads previews + Google Doc
 *   POST /gtm/aleads-source      — A-Leads bulk sourcing per ICP segment
 *   POST /gtm/messaging-doc      — Per-cell ERIC + HUIDIG messaging
 *   POST /gtm/cell-seed          — Skeleton cells from campaign_matrix_seed
 *   POST /gtm/cell-enrich        — Write approved messaging back to campaign_cells
 *   POST /eb/campaign-create     — EmailBison campaign create + inbox attachment
 *   POST /namecheap/purchase-domain    — Namecheap domain purchase
 *   POST /namecheap/set-nameservers    — Namecheap nameserver configuration
 *   GET  /health                 — Health check
 */

import { runWaterfallBatch } from './jobs/waterfall.ts';
import { runPipeline } from './jobs/pipeline.ts';
import { runPusher } from './jobs/pusher.ts';
import { enrichContact } from './jobs/enrich-contact.ts';
import { processGmapsBatch } from './jobs/gmaps-batch.ts';
import { validateLeads } from './jobs/validate-leads.ts';
import { runGtmResearch } from './jobs/gtm-research.ts';
import { runGtmResearchPoll } from './jobs/gtm-research-poll.ts';
import { runGtmSynthesis } from './jobs/gtm-synthesis.ts';
import { runDocRender } from './jobs/gtm-doc-render.ts';
import { runExecutionReview } from './jobs/gtm-execution-review.ts';
import { runAleadsSource } from './jobs/gtm-aleads-source.ts';
import { runMessagingDoc } from './jobs/gtm-messaging-doc.ts';
import { runCellSeed } from './jobs/gtm-cell-seed.ts';
import { runCellEnrich } from './jobs/gtm-cell-enrich.ts';
import { runCampaignCreate } from './jobs/eb-campaign-create.ts';
import { runPurchaseDomain } from './jobs/namecheap-purchase-domain.ts';
import { runSetNameservers } from './jobs/namecheap-set-nameservers.ts';

const PORT = parseInt(process.env.PORT ?? '3000');
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? '';

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true, ts: new Date().toISOString() });
    }

    // Supabase DB webhook — nieuwe contact inserted zonder email
    if (req.method === 'POST' && url.pathname === '/waterfall/webhook') {
      const secret = req.headers.get('x-webhook-secret');
      if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const payload = await req.json() as {
        type: string;
        record?: { id: string; client_id: string; email: string | null };
      };

      // Alleen INSERT events voor contacts zonder email
      if (payload.type !== 'INSERT' || !payload.record || payload.record.email) {
        return Response.json({ skipped: true });
      }

      const { id: contact_id, client_id } = payload.record;
      console.log(`[webhook] New contact without email: ${contact_id}`);

      // Fire-and-forget — antwoord snel terug aan Supabase
      runWaterfallBatch({ contact_ids: [contact_id], client_id, concurrency: 1 })
        .catch(err => console.error('[webhook] waterfall error:', err));

      return Response.json({ queued: contact_id });
    }

    // Handmatige batch run — optioneel client_id, cell_id, contact_ids
    if (req.method === 'POST' && url.pathname === '/waterfall') {
      const secret = req.headers.get('x-webhook-secret');
      if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const body = await req.json() as {
        client_id?: string;
        contact_ids?: string[];
        concurrency?: number;
      };

      console.log(`[batch] Starting waterfall — client=${body.client_id ?? 'all'}`);

      // Run async, stream terug via response zodra klaar
      const result = await runWaterfallBatch({
        client_id: body.client_id,
        contact_ids: body.contact_ids,
        concurrency: body.concurrency ?? 5,
      });

      return Response.json(result);
    }

    // Volledige sourcing pipeline: source → waterfall → push
    if (req.method === 'POST' && url.pathname === '/pipeline') {
      const secret = req.headers.get('x-webhook-secret');
      if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const body = await req.json() as {
        client_id: string;
        cell_id?: string;
        emailbison_campaign_id?: number;
        campaign_id?: string;
        sourcing_run_id?: string;
        steps?: ('source' | 'waterfall' | 'push')[];
        concurrency?: number;
        dry_run?: boolean;
      };

      if (!body.client_id) {
        return Response.json({ error: 'client_id is required' }, { status: 400 });
      }

      const steps = body.steps ?? ['source', 'waterfall', 'push'];
      console.log(`[pipeline] Start — client=${body.client_id} steps=${steps.join('+')}`);

      // Pipeline loopt door, HTTP wacht op resultaat (Railway heeft geen timeout)
      const result = await runPipeline(body);
      return Response.json(result);
    }

    // Losse EmailBison push (zonder volledige pipeline)
    if (req.method === 'POST' && url.pathname === '/push') {
      const secret = req.headers.get('x-webhook-secret');
      if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const body = await req.json() as {
        client_id: string;
        emailbison_campaign_id: number;
        campaign_id?: string;
        cell_id?: string;
        sourcing_run_id?: string;
        dry_run?: boolean;
        batch_size?: number;
      };

      if (!body.client_id || !body.emailbison_campaign_id) {
        return Response.json({ error: 'client_id and emailbison_campaign_id are required' }, { status: 400 });
      }

      console.log(`[push] Start — client=${body.client_id} campaign=${body.emailbison_campaign_id}`);
      const result = await runPusher(body);
      return Response.json(result);
    }

    // AI Enrich Contact
    if (req.method === 'POST' && url.pathname === '/enrich') {
      const secret = req.headers.get('x-webhook-secret');
      if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const body = await req.json() as {
        contact_id: string;
        cell_id?: string;
        use_web_research?: boolean;
      };

      if (!body.contact_id) {
        return Response.json({ error: 'contact_id is required' }, { status: 400 });
      }

      console.log(`[enrich] Start — contact=${body.contact_id}`);
      const result = await enrichContact(body);
      return Response.json(result);
    }

    // Process Google Maps Batch
    if (req.method === 'POST' && url.pathname === '/gmaps-batch') {
      const secret = req.headers.get('x-webhook-secret');
      if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const body = await req.json() as {
        scraper_job_id: string;
        companies: any[];
        client_id?: string;
      };

      if (!body.scraper_job_id || !body.companies || !Array.isArray(body.companies)) {
        return Response.json({ error: 'scraper_job_id and companies array are required' }, { status: 400 });
      }

      console.log(`[gmaps-batch] Start — job=${body.scraper_job_id} companies=${body.companies.length}`);
      const result = await processGmapsBatch(body);
      return Response.json(result);
    }

    // Validate Leads
    if (req.method === 'POST' && url.pathname === '/validate') {
      const secret = req.headers.get('x-webhook-secret');
      if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const body = await req.json() as {
        contact_ids?: string[];
        batch_size?: number;
        dry_run?: boolean;
        client_id?: string;
        cell_id?: string;
        sourcing_run_id?: string;
        method?: 'enrow' | 'omni';
      };

      console.log(`[validate] Start — method=${body.method ?? 'enrow'}`);
      const result = await validateLeads(body);
      return Response.json(result);
    }

    // GTM Research — start Exa deep research for a client
    if (req.method === 'POST' && url.pathname === '/gtm/research') {
      const secret = req.headers.get('x-webhook-secret');
      if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const body = await req.json() as { client_id: string };

      if (!body.client_id) {
        return Response.json({ error: 'client_id is required' }, { status: 400 });
      }

      console.log(`[gtm-research] Start — client=${body.client_id}`);
      const result = await runGtmResearch(body);
      return Response.json(result);
    }

    // GTM Research Poll — poll pending Exa research tasks
    if (req.method === 'POST' && url.pathname === '/gtm/research/poll') {
      const secret = req.headers.get('x-webhook-secret');
      if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const body = await req.json() as Record<string, unknown>;

      console.log('[gtm-research-poll] Start');
      const result = await runGtmResearchPoll(body);
      return Response.json(result);
    }

    // GTM Synthesis — synthesize research + form into GTM strategy
    if (req.method === 'POST' && url.pathname === '/gtm/synthesis') {
      const secret = req.headers.get('x-webhook-secret');
      if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const body = await req.json() as { client_id: string };

      if (!body.client_id) {
        return Response.json({ error: 'client_id is required' }, { status: 400 });
      }

      console.log(`[gtm-synthesis] Start — client=${body.client_id}`);
      const result = await runGtmSynthesis(body);
      return Response.json(result);
    }

    // GTM Doc Render — create Google Docs from GTM strategy synthesis
    if (req.method === 'POST' && url.pathname === '/gtm/doc-render') {
      const secret = req.headers.get('x-webhook-secret');
      if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const body = await req.json() as { client_id?: string; mode?: 'internal' | 'external' | 'demo' };
      console.log(`[gtm-doc-render] Start — client=${body.client_id ?? 'demo'} mode=${body.mode ?? 'internal'}`);
      const result = await runDocRender(body);
      return Response.json(result);
    }

    // GTM Execution Review — keyword profiles + A-Leads previews + Google Doc
    if (req.method === 'POST' && url.pathname === '/gtm/execution-review') {
      const secret = req.headers.get('x-webhook-secret');
      if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const body = await req.json() as { client_id: string };
      if (!body.client_id) {
        return Response.json({ error: 'client_id is required' }, { status: 400 });
      }

      console.log(`[gtm-execution-review] Start — client=${body.client_id}`);
      const result = await runExecutionReview(body);
      return Response.json(result);
    }

    // GTM A-Leads Source — bulk sourcing per ICP segment
    if (req.method === 'POST' && url.pathname === '/gtm/aleads-source') {
      const secret = req.headers.get('x-webhook-secret');
      if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const body = await req.json() as {
        client_id: string;
        cell_id?: string;
        sourcing_run_id?: string;
        dry_run?: boolean;
      };

      if (!body.client_id) {
        return Response.json({ error: 'client_id is required' }, { status: 400 });
      }

      console.log(`[gtm-aleads-source] Start — client=${body.client_id}${body.cell_id ? ` cell=${body.cell_id}` : ''}`);
      const result = await runAleadsSource(body);
      return Response.json(result);
    }

    // GTM Messaging Doc — per-cell ERIC + HUIDIG messaging
    if (req.method === 'POST' && url.pathname === '/gtm/messaging-doc') {
      const secret = req.headers.get('x-webhook-secret');
      if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const body = await req.json() as { client_id: string };

      if (!body.client_id) {
        return Response.json({ error: 'client_id is required' }, { status: 400 });
      }

      console.log(`[gtm-messaging-doc] Start — client=${body.client_id}`);
      const result = await runMessagingDoc(body);
      return Response.json(result);
    }

    // GTM Cell Seed — skeleton cells from campaign_matrix_seed
    if (req.method === 'POST' && url.pathname === '/gtm/cell-seed') {
      const secret = req.headers.get('x-webhook-secret');
      if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const body = await req.json() as { client_id: string };

      if (!body.client_id) {
        return Response.json({ error: 'client_id is required' }, { status: 400 });
      }

      console.log(`[gtm-cell-seed] Start — client=${body.client_id}`);
      const result = await runCellSeed(body);
      return Response.json(result);
    }

    // GTM Cell Enrich — write approved messaging back to campaign_cells
    if (req.method === 'POST' && url.pathname === '/gtm/cell-enrich') {
      const secret = req.headers.get('x-webhook-secret');
      if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const body = await req.json() as { client_id: string };

      if (!body.client_id) {
        return Response.json({ error: 'client_id is required' }, { status: 400 });
      }

      console.log(`[gtm-cell-enrich] Start — client=${body.client_id}`);
      const result = await runCellEnrich(body);
      return Response.json(result);
    }

    // EmailBison Campaign Create — create campaigns with standard settings + warmed inbox attachment
    if (req.method === 'POST' && url.pathname === '/eb/campaign-create') {
      const secret = req.headers.get('x-webhook-secret');
      if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const body = await req.json() as {
        client_code: string;
        campaign_name: string;
        template?: string;
        sequence_id?: string;
        sequence_steps?: any[];
        mode?: 'review' | 'immediate';
        min_warmup_score?: number;
        cell_id?: string;
        skip_sequence_creation?: boolean;
        emailbison_campaign_id?: string;
      };

      if (!body.client_code || !body.campaign_name) {
        return Response.json({ error: 'client_code and campaign_name are required' }, { status: 400 });
      }

      console.log(`[eb-campaign-create] Start — client=${body.client_code} name=${body.campaign_name} mode=${body.mode ?? 'review'}`);
      const result = await runCampaignCreate(body);
      return Response.json(result);
    }

    // Namecheap Purchase Domain — buy domains via Namecheap API
    if (req.method === 'POST' && url.pathname === '/namecheap/purchase-domain') {
      const secret = req.headers.get('x-webhook-secret');
      if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const body = await req.json() as { client_id?: string; domains: string[]; years?: number };

      if (!body.domains || !Array.isArray(body.domains) || body.domains.length === 0) {
        return Response.json({ error: 'domains array is required' }, { status: 400 });
      }

      console.log(`[namecheap-purchase] Start — domains=${body.domains.join(',')}`);
      const result = await runPurchaseDomain(body);
      return Response.json(result);
    }

    // Namecheap Set Nameservers — configure Cloudflare nameservers
    if (req.method === 'POST' && url.pathname === '/namecheap/set-nameservers') {
      const secret = req.headers.get('x-webhook-secret');
      if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const body = await req.json() as { domain_id?: string; domain?: string; nameservers?: string[] };

      if (!body.domain_id && !body.domain) {
        return Response.json({ error: 'domain_id or domain is required' }, { status: 400 });
      }

      console.log(`[namecheap-set-ns] Start — domain=${body.domain_id ?? body.domain}`);
      const result = await runSetNameservers(body);
      return Response.json(result);
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },
});

console.log(`Batch worker listening on port ${PORT}`);
