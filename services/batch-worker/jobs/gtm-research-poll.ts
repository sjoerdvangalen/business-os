/**
 * GTM Research Poll job
 * Polls all pending Exa research tasks and updates their status
 */

import { createClient } from '@supabase/supabase-js';
import { runGtmSynthesis } from './gtm-synthesis.ts';

const EXA_API_KEY = process.env.EXA_API_KEY ?? '';

interface PollPayload {
  // No required fields — polls all pending research tasks
}

interface PollResult {
  success: boolean;
  polled?: number;
  completed?: number;
  failed?: number;
  pending?: number;
  error?: string;
}

interface ClientRow {
  id: string;
  exa_research: Record<string, unknown>;
}

export async function runGtmResearchPoll(_payload?: PollPayload): Promise<PollResult> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  try {
    // Fetch all clients with pending Exa research
    const { data: clients, error: fetchError } = await supabase
      .from('clients')
      .select('id, exa_research')
      .eq('exa_research->>status', 'pending');

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    if (!clients || clients.length === 0) {
      return { success: true, polled: 0, message: 'No pending research tasks' } as PollResult;
    }

    console.log(`[${requestId}] Polling ${clients.length} pending Exa research task(s)`);

    const results = await Promise.allSettled(
      (clients as ClientRow[]).map(client => pollClient(supabase, client, requestId))
    );

    const completed = results.filter(r => r.status === 'fulfilled' && (r.value as Record<string, unknown>).action === 'completed').length;
    const failed = results.filter(r => r.status === 'fulfilled' && (r.value as Record<string, unknown>).action === 'failed').length;
    const pending = results.filter(r => r.status === 'fulfilled' && (r.value as Record<string, unknown>).action === 'still_pending').length;

    return { success: true, polled: clients.length, completed, failed, pending };

  } catch (error) {
    const msg = (error as Error).message;
    console.error(`[${requestId}] Unhandled error:`, msg);
    return { success: false, error: msg };
  }
}

async function pollClient(
  supabase: ReturnType<typeof createClient>,
  client: ClientRow,
  requestId: string
): Promise<{ client_id: string; action: string }> {
  const taskId = client.exa_research?.task_id as string;

  if (!taskId) {
    console.warn(`[${requestId}] Client ${client.id} has no task_id in exa_research`);
    return { client_id: client.id, action: 'no_task_id' };
  }

  try {
    const exaResponse = await fetch(`https://api.exa.ai/research/v1/${taskId}`, {
      headers: { 'x-api-key': EXA_API_KEY },
    });

    if (!exaResponse.ok) {
      const errText = await exaResponse.text();
      console.error(`[${requestId}] Exa poll error for task ${taskId}: ${exaResponse.status} ${errText}`);

      if (exaResponse.status === 404) {
        await supabase.from('clients').update({
          exa_research: { ...client.exa_research, status: 'failed', error: 'Task not found' },
        }).eq('id', client.id);
        return { client_id: client.id, action: 'failed' };
      }

      return { client_id: client.id, action: 'still_pending' };
    }

    const taskData = await exaResponse.json() as { status?: string; [key: string]: unknown };
    console.log(`[${requestId}] Task ${taskId} status: ${taskData.status}`);

    if (taskData.status === 'completed') {
      const now = new Date().toISOString();
      await supabase.from('clients').update({
        exa_research: {
          ...client.exa_research,
          status: 'completed',
          result: taskData,
          fetched_at: now,
          error: null,
        },
      }).eq('id', client.id);

      // Trigger synthesis (fire-and-forget via direct function call)
      runGtmSynthesis({ client_id: client.id })
        .then(() => console.log(`[${requestId}] gtm-synthesis triggered for ${client.id}`))
        .catch(err => console.error(`[${requestId}] gtm-synthesis trigger failed for ${client.id}:`, err.message));

      console.log(`[${requestId}] Research completed for client ${client.id}, triggered gtm-synthesis`);
      return { client_id: client.id, action: 'completed' };
    }

    if (taskData.status === 'failed' || taskData.status === 'error') {
      await supabase.from('clients').update({
        exa_research: {
          ...client.exa_research,
          status: 'failed',
          error: (taskData.error as string) || taskData.status,
        },
      }).eq('id', client.id);
      return { client_id: client.id, action: 'failed' };
    }

    // Still in progress (running, queued, etc.)
    return { client_id: client.id, action: 'still_pending' };

  } catch (err) {
    console.error(`[${requestId}] Poll failed for client ${client.id}:`, (err as Error).message);
    return { client_id: client.id, action: 'still_pending' };
  }
}
