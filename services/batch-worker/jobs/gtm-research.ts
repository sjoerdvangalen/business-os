/**
 * GTM Research job
 * Creates Exa research task for a client based on onboarding form data
 */

import { createClient } from '@supabase/supabase-js';

const EXA_API_KEY = process.env.EXA_API_KEY ?? '';

interface ResearchPayload {
  client_id: string;
}

interface ResearchResult {
  success: boolean;
  client_id?: string;
  task_id?: string;
  request_id?: string;
  error?: string;
}

// Build research prompt from onboarding_form canonical contract
function buildResearchPrompt(form: Record<string, unknown>): string {
  const basics = (form.company_basics as Record<string, string>) ?? {};
  const scope = (form.scope_and_priority as Record<string, string>) ?? {};
  const icp = (form.icp_constraints as Record<string, string>) ?? {};
  const buyer = (form.buyer_scope as Record<string, string>) ?? {};
  const messaging = (form.messaging_boundaries as Record<string, string>) ?? {};

  return `
Research this company thoroughly for B2B outbound campaign strategy:

Company: ${basics.company_name || 'Unknown'}
Website: ${basics.website || 'Unknown'}

Solutions they offer:
${scope.solutions_text || 'Not specified'}

Priority solution and why:
${scope.priority_solution_text || 'Not specified'}

Target ICP segments (as described by client):
${icp.icp_segments_text || 'Not specified'}

Must-have criteria for prospects:
${icp.must_have_criteria_text || 'Not specified'}

Hard disqualifiers:
${icp.hard_disqualifiers_text || 'Not specified'}

Target buyer personas:
${buyer.target_personas_text || 'Not specified'}

Preferred tone: ${messaging.preferred_tone || 'Not specified'}

Research goals:
1. Company overview: what do they actually do, value proposition, differentiation
2. Competitive landscape: who are their main competitors, how do they differ
3. Market signals: growth indicators, market trends, trigger events relevant to their ICP
4. Proof and credibility: notable clients, case studies, awards, partnerships
5. ICP validation: do their described segments match observable market opportunities
6. Persona insights: what do their target personas care about, what pain points resonate
7. Outbound angle hypotheses: 2-3 specific angles that would resonate with their ICP
`.trim();
}

export async function runGtmResearch(payload: ResearchPayload): Promise<ResearchResult> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  try {
    const { client_id } = payload;

    if (!client_id) {
      return { success: false, error: 'Missing client_id', request_id: requestId };
    }

    // Fetch client onboarding_form
    const { data: client, error: fetchError } = await supabase
      .from('clients')
      .select('id, name, onboarding_form')
      .eq('id', client_id)
      .single();

    if (fetchError || !client) {
      return {
        success: false,
        error: `Client not found: ${fetchError?.message}`,
        request_id: requestId,
      };
    }

    if (!EXA_API_KEY) {
      return { success: false, error: 'EXA_API_KEY not configured', request_id: requestId };
    }

    const prompt = buildResearchPrompt(client.onboarding_form as Record<string, unknown> ?? {});

    // Create Exa Research Pro task
    const exaResponse = await fetch('https://api.exa.ai/research/v1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': EXA_API_KEY,
      },
      body: JSON.stringify({
        instructions: prompt,
        model: 'exa-research-pro',
      }),
    });

    if (!exaResponse.ok) {
      const errText = await exaResponse.text();
      console.error(`[${requestId}] Exa API error ${exaResponse.status}: ${errText}`);
      return {
        success: false,
        error: `Exa API error: ${exaResponse.status}`,
        request_id: requestId,
      };
    }

    const exaTask = await exaResponse.json() as { id?: string; researchId?: string; status?: string };
    const taskId = exaTask.researchId || exaTask.id;

    if (!taskId) {
      return {
        success: false,
        error: 'Exa did not return a task ID',
        request_id: requestId,
      };
    }

    const now = new Date().toISOString();

    // Store research task in exa_research column
    const { error: updateError } = await supabase
      .from('clients')
      .update({
        exa_research: {
          status: 'pending',
          task_id: taskId,
          created_at: now,
          fetched_at: null,
          result: null,
          error: null,
        },
      })
      .eq('id', client_id);

    if (updateError) {
      console.error(`[${requestId}] Failed to update exa_research:`, updateError.message);
      return { success: false, error: updateError.message, request_id: requestId };
    }

    console.log(`[${requestId}] Exa research task created: client=${client_id} task=${taskId}`);

    return {
      success: true,
      client_id,
      task_id: taskId,
      request_id: requestId,
    };

  } catch (error) {
    const msg = (error as Error).message;
    console.error(`[${requestId}] Unhandled error:`, msg);
    return { success: false, error: msg, request_id: requestId };
  }
}
