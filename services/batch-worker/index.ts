/**
 * Business-OS Batch Worker
 * HTTP server op Railway — verwerkt batch jobs getriggerd via Supabase webhooks of directe calls
 *
 * Endpoints:
 *   POST /waterfall          — Email waterfall voor alle contacts zonder email (optioneel client_id filter)
 *   POST /waterfall/webhook  — Supabase DB webhook handler (nieuwe contact zonder email)
 *   GET  /health             — Health check
 */

import { runWaterfallBatch } from './jobs/waterfall.ts';
import { runPipeline } from './jobs/pipeline.ts';

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

    return Response.json({ error: 'Not found' }, { status: 404 });
  },
});

console.log(`Batch worker listening on port ${PORT}`);
