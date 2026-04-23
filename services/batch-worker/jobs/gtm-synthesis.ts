/**
 * GTM Synthesis job
 * Synthesizes Exa research + onboarding form into gtm_synthesis_v2 strategy object
 */

import { createClient } from '@supabase/supabase-js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const SYNTHESIS_MODEL = 'o4-mini';

interface SynthesisPayload {
  client_id: string;
}

interface SynthesisResult {
  success: boolean;
  client_id?: string;
  request_id?: string;
  error?: string;
}

const SYSTEM_PROMPT = `You are a senior B2B outbound strategist and GTM architect. Your job is to synthesize all available research about a company into a complete GTM strategy object (gtm_synthesis_v2) that will guide outbound campaigns, ICP sourcing, and messaging.

Output ONLY valid JSON matching the exact schema below. No markdown, no preamble, no explanation.

CRITICAL RULES:
- Do NOT generate hooks, subject lines, or outreach copy.
- Do NOT prioritize cells. Include all valid combinations that satisfy qualification constraints.
- Do NOT include pilot_test_logic, sample sizes, or test counts. Those are determined in execution.
- Winners are determined later in execution testing, not in synthesis.
- icp_key and vertical_key are SEPARATE dimensions. A cell has both — never equate them.
- campaign_matrix_seed.length = number of valid cells (NOT personas × verticals × solutions).
- Only include cells where the solution × vertical × persona combination is plausibly valid given qualification constraints.

REQUIRED OUTPUT FIELDS (no exceptions):
solutions, qualification_framework, icp_segments, buyer_personas,
persona_map, persona_start_verbs,
verticals, vertical_map, vertical_customer_terms, vertical_expert_terms,
proof_assets, value_prop_formula, campaign_matrix_seed,
messaging_direction, research_context

Schema (gtm_synthesis_v2):
{
  "version": 2,
  "synthesized_at": "ISO 8601 timestamp",
  "company_thesis": "One sharp sentence: what the company does and who it is for",
  "solutions": [
    {
      "key": "machine-readable-slug",
      "name": "Solution name",
      "description": "What it does and delivers",
      "value_proposition": "Core value in one sentence",
      "proof_points": ["Evidence, case studies, outcomes"]
    }
  ],
  "qualification_framework": {
    "firmographic_constraints": {
      "min_employees": null,
      "max_employees": null,
      "geos": [],
      "industries_include": [],
      "industries_exclude": []
    },
    "hard_requirements": [],
    "hard_disqualifiers": [],
    "soft_signals": []
  },
  "icp_segments": [
    {
      "key": "machine-readable-slug (e.g. mid-market-staffing-nl)",
      "name": "Short segment name (firmographic profile label)",
      "geo": "Country/region",
      "employee_range": "e.g. 50-500",
      "industries": ["List of relevant industries"],
      "signal_hypotheses": ["Observable signals that indicate a good prospect"],
      "sourcing_logic": "How to filter in A-Leads: employee range, industries, geo, job titles"
    }
  ],
  "buyer_personas": [
    {
      "title": "Job title",
      "pain_points": ["What keeps them up at night"],
      "motivations": ["What they want to achieve"]
    }
  ],
  "persona_map": [
    {
      "key": "cx",
      "label": "CX Leadership",
      "focus_themes": ["experience", "NPS", "satisfaction"],
      "owns_metric": "CSAT / NPS",
      "primary_pain": "Observable pain this persona experiences"
    }
  ],
  "persona_start_verbs": {
    "persona_key": ["Verb1", "Verb2", "Verb3"]
  },
  "verticals": [
    {
      "key": "staffing",
      "label": "Staffing & Recruitment",
      "industries": ["Staffing", "RPO", "Executive Search"]
    }
  ],
  "vertical_map": [
    {
      "vertical_key": "staffing",
      "customer_term": "candidates",
      "expert_term": "recruiters / talent consultants",
      "vertical_pain": "Pain specific to this vertical"
    }
  ],
  "vertical_customer_terms": {
    "vertical_key": "customer term used in this vertical"
  },
  "vertical_expert_terms": {
    "vertical_key": "expert/operator term used in this vertical"
  },
  "proof_assets": [
    {
      "type": "case_study|testimonial|stat|partnership|award",
      "description": "The proof point",
      "use_for": "Which vertical/persona/stage this proof works best for"
    }
  ],
  "value_prop_formula": {
    "style": "ERIC",
    "bullet_1_pattern": "[persona_verb] [specific outcome] [via product_mechanism] to [expert_term]",
    "bullet_2_pattern": "Route/Match/Automate [customer_term] via [mechanism] based on [A] and [B]",
    "bullet_3_pattern": "[Scale/Deliver/Cut] [result] without [vertical_pain] using [product_ai_component]",
    "product_mechanism": "exact product mechanism term (e.g. intent-level pairing)",
    "product_ai_component": "exact AI component term (e.g. AI Supervisor)"
  },
  "campaign_matrix_seed": [
    {
      "cell_code": "CLIENT|EN|solution-key|icp-key|vertical-key|persona-key|geo",
      "solution_key": "solution slug",
      "icp_key": "icp segment key slug (firmographic — matches icp_segments[].key)",
      "vertical_key": "vertical key (sector — matches verticals[].key)",
      "persona_key": "persona key (matches persona_map[].key)",
      "geo": "NLBE|DACH|UK|NA|global",
      "target_job_title_families": ["VP of CX", "Director of Support"],
      "trigger_event_classes": ["hiring_cx_roles", "job_change", "funding"],
      "estimated_addressable_accounts": null,
      "feasibility_notes": null,
      "valid": true
    }
  ],
  "messaging_direction": {
    "core_angle": "The single most compelling outbound angle based on research",
    "proof_narrative": "How to weave proof into messaging without being salesy",
    "tone_instructions": "Specific tone guidance for cold email copy"
  },
  "research_context": {
    "company_overview": "Synthesized overview from Exa research",
    "competitive_landscape": "Key competitors and how client differentiates",
    "market_signals": "Relevant market trends and trigger events relevant to outbound",
    "product_terminology": {
      "_note": "Extract exact terms the product uses for mechanisms, features, AI components",
      "example_mechanism": "intent-level pairing",
      "example_ai_component": "AI Supervisor"
    },
    "vertical_terminology": {
      "_note": "Per-vertical customer and expert terms extracted from research — used in messaging",
      "vertical_key": {
        "customer_term": "term for the people this product serves (e.g. candidates, patients, users)",
        "expert_term": "term for the operator/expert routing/managing them (e.g. recruiters, care coordinators)"
      }
    },
    "exa_sources": ["URLs or sources referenced in Exa research"]
  },
  "risks_and_assumptions": [
    {
      "type": "risk|assumption",
      "description": "What the risk or assumption is",
      "mitigation": "How to handle it or what to watch for"
    }
  ],
  "open_questions": ["Questions to validate during execution"],
  "internal_notes": "Any notes for internal use only (not shared with client)"
}`;

function buildUserPrompt(
  form: Record<string, unknown>,
  exaResult: Record<string, unknown> | null
): string {
  const basics = (form.company_basics as Record<string, string>) ?? {};
  const scope = (form.scope_and_priority as Record<string, string>) ?? {};
  const icp = (form.icp_constraints as Record<string, string>) ?? {};
  const buyer = (form.buyer_scope as Record<string, string>) ?? {};
  const proof = (form.proof_and_claims as Record<string, string>) ?? {};
  const messaging = (form.messaging_boundaries as Record<string, string>) ?? {};

  const formSection = `
## ONBOARDING FORM DATA

Company: ${basics.company_name || 'Unknown'}
Website: ${basics.website || 'Unknown'}

Solutions offered:
${scope.solutions_text || 'Not specified'}

Priority solution:
${scope.priority_solution_text || 'Not specified'}

ICP segments (as described by client):
${icp.icp_segments_text || 'Not specified'}

Must-have criteria:
${icp.must_have_criteria_text || 'Not specified'}

Hard disqualifiers:
${icp.hard_disqualifiers_text || 'Not specified'}

Target buyer personas:
${buyer.target_personas_text || 'Not specified'}

Excluded personas:
${buyer.excluded_personas_text || 'Not specified'}

Allowed proof/claims:
${proof.allowed_proof_text || 'Not specified'}
${proof.allowed_claims_text || 'Not specified'}

Disallowed proof/claims:
${proof.disallowed_proof_text || 'Not specified'}
${proof.disallowed_claims_text || 'Not specified'}

Preferred tone: ${messaging.preferred_tone || 'Not specified'}
Avoid tone: ${messaging.avoid_tone || 'Not specified'}
Compliance restrictions: ${messaging.compliance_restrictions || 'None'}
`.trim();

  const researchSection = exaResult
    ? buildStructuredExaSection(exaResult)
    : '\n\n## EXA RESEARCH OUTPUT\n\nNot yet available — synthesize based on form data only.';

  return `${formSection}${researchSection}

Now synthesize this into the complete GTM strategy JSON object. Use ISO timestamp for synthesized_at.`;
}

function buildStructuredExaSection(exaResult: Record<string, unknown>): string {
  // If exa_result is already pre-structured (6 named blocks), use directly
  const structured = exaResult as Record<string, unknown>;

  const block = (label: string, key: string, fallback = ''): string => {
    const val = structured[key];
    if (!val) return fallback ? `\n\n### ${label}\n${fallback}` : '';
    const text = typeof val === 'string' ? val : JSON.stringify(val, null, 2);
    return `\n\n### ${label}\n${text.substring(0, 2000)}`;
  };

  return `\n\n## EXA RESEARCH OUTPUT (structured)` +
    block('Company Overview', 'company_overview', 'Not available — infer from form data.') +
    block('Proof & Credibility', 'proof_and_credibility', 'Not available.') +
    block('Persona Insights', 'persona_insights', 'Not available.') +
    block('Product Terminology', 'product_terminology', 'Extract from company overview.') +
    block('Trigger Events & Market Signals', 'trigger_events', 'Not available.') +
    block('Competitive Landscape', 'competitors', 'Not available.');
}

const REQUIRED_KEYS = [
  'company_thesis',
  'solutions',
  'qualification_framework',
  'icp_segments',
  'buyer_personas',
  'persona_map',
  'persona_start_verbs',
  'verticals',
  'vertical_map',
  'vertical_customer_terms',
  'vertical_expert_terms',
  'value_prop_formula',
  'campaign_matrix_seed',
  'messaging_direction',
];

export async function runGtmSynthesis(payload: SynthesisPayload): Promise<SynthesisResult> {
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

    if (!OPENAI_API_KEY) {
      return { success: false, error: 'OPENAI_API_KEY not configured', request_id: requestId };
    }

    const { data: client, error: fetchError } = await supabase
      .from('clients')
      .select('id, name, onboarding_form, exa_research')
      .eq('id', client_id)
      .single();

    if (fetchError || !client) {
      return {
        success: false,
        error: `Client not found: ${fetchError?.message}`,
        request_id: requestId,
      };
    }

    const form = (client.onboarding_form as Record<string, unknown>) ?? {};
    const exaResearch = client.exa_research as Record<string, unknown> | null;
    const exaResult = exaResearch?.status === 'completed'
      ? (exaResearch.result as Record<string, unknown>)
      : null;

    console.log(`[${requestId}] Synthesizing for client ${client_id} (exa status: ${exaResearch?.status ?? 'none'})`);

    const userPrompt = buildUserPrompt(form, exaResult);

    const chatResponse = await fetch(OPENAI_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: SYNTHESIS_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_completion_tokens: 8000,
        reasoning_effort: 'medium',
      }),
    });

    if (!chatResponse.ok) {
      const errText = await chatResponse.text();
      console.error(`[${requestId}] LLM API error ${chatResponse.status}: ${errText}`);
      return {
        success: false,
        error: `LLM API error: ${chatResponse.status}`,
        request_id: requestId,
      };
    }

    const chatData = await chatResponse.json() as {
      choices?: Array<{ message: { content: string } }>;
    };

    const rawContent = chatData.choices?.[0]?.message?.content;
    if (!rawContent) {
      return { success: false, error: 'LLM returned empty response', request_id: requestId };
    }

    let synthesis: Record<string, unknown>;
    try {
      const jsonMatch = rawContent.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || rawContent.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1] : rawContent;
      synthesis = JSON.parse(jsonStr);
    } catch {
      console.error(`[${requestId}] Failed to parse LLM JSON output`);
      return {
        success: false,
        error: 'LLM output is not valid JSON',
        request_id: requestId,
      };
    }

    // Hard validate required keys before DB write
    for (const key of REQUIRED_KEYS) {
      if (!synthesis[key]) {
        console.error(`[${requestId}] synthesis missing required key: ${key}`);
        return {
          success: false,
          error: `synthesis missing key: ${key}`,
          request_id: requestId,
        };
      }
    }

    synthesis.synthesized_at = new Date().toISOString();
    synthesis.version = 2;

    // Primary write: gtm_strategies (canonical write truth)
    const { data: existingStrategy } = await supabase
      .from('gtm_strategies')
      .select('id')
      .eq('client_id', client_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let strategyWriteError: { message: string } | null = null;

    if (existingStrategy?.id) {
      const { error } = await supabase
        .from('gtm_strategies')
        .update({ synthesis: synthesis, status: 'synthesized', updated_at: new Date().toISOString() })
        .eq('id', existingStrategy.id);
      strategyWriteError = error;
    } else {
      const { error } = await supabase
        .from('gtm_strategies')
        .insert({ client_id, synthesis, status: 'synthesized' });
      strategyWriteError = error;
    }

    if (strategyWriteError) {
      console.error(`[${requestId}] Failed to write to gtm_strategies:`, strategyWriteError.message);
      return { success: false, error: strategyWriteError.message, request_id: requestId };
    }

    // Backwards-compat mirror: clients.gtm_synthesis (DEPRECATED_READONLY)
    const { error: mirrorError } = await supabase
      .from('clients')
      .update({
        gtm_synthesis: synthesis,
        approval_status: 'synthesized',
      })
      .eq('id', client_id);

    if (mirrorError) {
      console.warn(`[${requestId}] Mirror to clients.gtm_synthesis failed (non-fatal):`, mirrorError.message);
    }

    // Fire-and-forget → gtm-doc-render (Supabase edge function, not ported)
    const supabaseUrl = process.env.SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    fetch(`${supabaseUrl}/functions/v1/gtm-doc-render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ client_id, mode: 'internal' }),
    })
      .then(r => console.log(`[${requestId}] gtm-doc-render triggered: ${r.status}`))
      .catch(err => console.error(`[${requestId}] gtm-doc-render trigger failed:`, err.message));

    console.log(`[${requestId}] Synthesis complete for client ${client_id}, triggered gtm-doc-render`);

    return { success: true, client_id, request_id: requestId };

  } catch (error) {
    const msg = (error as Error).message;
    console.error(`[${requestId}] Unhandled error:`, msg);
    return { success: false, error: msg, request_id: requestId };
  }
}
