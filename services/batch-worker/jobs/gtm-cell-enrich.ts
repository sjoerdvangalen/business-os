import { createClient } from '@supabase/supabase-js';
import { resolveFormula } from './shared/formula_resolver.ts';
import { PERSONA_REGISTRY } from './shared/persona_registry.ts';
import type { PersonaKey } from './shared/persona_registry.ts';
import type { VerticalKey } from './shared/vertical_registry.ts';

const KIMI_API_KEY = process.env['KIMI_API_KEY'] ?? '';
const KIMI_BASE_URL = (process.env['KIMI_BASE_URL'] || 'https://api.kimi.com').replace(/\/$/, '');
const QA_MODEL = 'kimi-k2-5';

// ── Layer 1 — Deterministic QA ───────────────────────────────────────────────

interface Layer1Result {
  passed: boolean;
  failures: string[];
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function runLayer1QA(
  entry: Record<string, unknown>,
  personaKey: PersonaKey,
  _verticalKey: VerticalKey,
): Layer1Result {
  const failures: string[] = [];
  const persona = PERSONA_REGISTRY[personaKey];
  if (!persona) {
    return { passed: false, failures: [`Unknown persona_key: ${personaKey}`] };
  }

  const globalBanned = ['faster', 'better', 'improved', 'enhanced', 'major', 'key', 'critical'];
  const bannedAdjectives = [...new Set([...globalBanned, ...persona.banned_adjectives])];

  // Pull bullets from hook_frameworks (check both ERIC and HUIDIG if present)
  const hookFrameworks = entry.hook_frameworks as Record<string, unknown> | null | undefined;
  if (!hookFrameworks) {
    return { passed: false, failures: ['hook_frameworks missing from entry'] };
  }

  // Collect all framework keys to check (ERIC, HUIDIG, or any present)
  const frameworkKeys = Object.keys(hookFrameworks);
  if (frameworkKeys.length === 0) {
    return { passed: false, failures: ['hook_frameworks is empty'] };
  }

  for (const fwKey of frameworkKeys) {
    const fw = hookFrameworks[fwKey] as Record<string, unknown> | null | undefined;
    if (!fw) continue;

    const bullets = (fw.bullets as string[] | null | undefined) ?? [];
    if (bullets.length < 3) {
      failures.push(`${fwKey}: expected 3 bullets, got ${bullets.length}`);
      continue;
    }

    const [b1, b2, b3] = bullets;

    // ── Banned adjectives ──────────────────────────────────────────────────
    for (const adj of bannedAdjectives) {
      const re = new RegExp(`\\b${adj}\\b`, 'i');
      if (re.test(b1)) failures.push(`${fwKey} B1: banned adjective "${adj}"`);
      if (re.test(b2)) failures.push(`${fwKey} B2: banned adjective "${adj}"`);
      if (re.test(b3)) failures.push(`${fwKey} B3: banned adjective "${adj}"`);
    }

    // ── Signature verb checks ──────────────────────────────────────────────
    const b1StartsWithVerb = persona.bullets.b1.verb.some(v => b1.trimStart().startsWith(v));
    if (!b1StartsWithVerb) {
      failures.push(`${fwKey} B1: must start with one of [${persona.bullets.b1.verb.join(', ')}], got: "${b1.slice(0, 30)}"`);
    }
    const b2StartsWithVerb = persona.bullets.b2.verb.some(v => b2.trimStart().startsWith(v));
    if (!b2StartsWithVerb) {
      failures.push(`${fwKey} B2: must start with one of [${persona.bullets.b2.verb.join(', ')}], got: "${b2.slice(0, 30)}"`);
    }
    const b3StartsWithVerb = persona.bullets.b3.verb.some(v => b3.trimStart().startsWith(v));
    if (!b3StartsWithVerb) {
      failures.push(`${fwKey} B3: must start with one of [${persona.bullets.b3.verb.join(', ')}], got: "${b3.slice(0, 30)}"`);
    }

    // ── Required phrases ───────────────────────────────────────────────────
    for (const phrase of persona.bullets.b1.required_phrases) {
      if (!b1.includes(phrase)) failures.push(`${fwKey} B1: missing required phrase "${phrase}"`);
    }
    for (const phrase of persona.bullets.b2.required_phrases) {
      if (!b2.includes(phrase)) failures.push(`${fwKey} B2: missing required phrase "${phrase}"`);
    }
    for (const phrase of persona.bullets.b3.required_phrases) {
      if (!b3.includes(phrase)) failures.push(`${fwKey} B3: missing required phrase "${phrase}"`);
    }

    // ── Word count ─────────────────────────────────────────────────────────
    const { min, max } = persona.word_count;
    const wc1 = countWords(b1);
    const wc2 = countWords(b2);
    const wc3 = countWords(b3);
    if (wc1 < min || wc1 > max) failures.push(`${fwKey} B1: word count ${wc1} outside [${min}, ${max}]`);
    if (wc2 < min || wc2 > max) failures.push(`${fwKey} B2: word count ${wc2} outside [${min}, ${max}]`);
    if (wc3 < min || wc3 > max) failures.push(`${fwKey} B3: word count ${wc3} outside [${min}, ${max}]`);
  }

  return { passed: failures.length === 0, failures };
}

// ── Layer 2 — Soft scoring (Kimi) ────────────────────────────────────────────

interface QAScore {
  specificity: number;
  vertical_fit: number;
  persona_fit: number;
  proof_fit: number;
  cta_fit: number;
  total: number;
}

async function runLayer2QA(
  entry: Record<string, unknown>,
  resolverOutput: Record<string, unknown>,
): Promise<QAScore | null> {
  if (!KIMI_API_KEY) return null;

  const hookFrameworks = entry.hook_frameworks as Record<string, unknown> | null | undefined;
  const bulletsPreview = hookFrameworks
    ? Object.entries(hookFrameworks).slice(0, 1).map(([k, fw]) => {
        const f = fw as Record<string, unknown>;
        return `${k}:\n${((f.bullets as string[]) ?? []).map((b, i) => `  B${i + 1}: ${b}`).join('\n')}`;
      }).join('\n')
    : 'No bullets';

  const prompt = `Score these cold email bullets on 5 dimensions (0-10 each).

Persona: ${entry.persona_key ?? 'unknown'}
Vertical: ${entry.vertical_key ?? 'unknown'}
Hook variant: ${resolverOutput.default_hook_variant ?? 'unknown'}
Offer variant: ${resolverOutput.default_offer_variant ?? 'unknown'}
CTA variant: ${resolverOutput.default_cta_variant ?? 'unknown'}

Bullets:
${bulletsPreview}

Return ONLY valid JSON with these keys:
{
  "specificity": <0-10>,
  "vertical_fit": <0-10>,
  "persona_fit": <0-10>,
  "proof_fit": <0-10>,
  "cta_fit": <0-10>
}

Criteria:
- specificity: Are the bullets concrete and specific (not generic)?
- vertical_fit: Does the language match the vertical's terminology?
- persona_fit: Does the copy match the persona's focus and language style?
- proof_fit: Is proof or evidence appropriately integrated?
- cta_fit: Does the CTA variant match the signal tier and offer type?`;

  try {
    const res = await fetch(`${KIMI_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KIMI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: QA_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 200,
      }),
    });

    if (!res.ok) return null;

    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? '';

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Partial<QAScore>;
    const { specificity = 0, vertical_fit = 0, persona_fit = 0, proof_fit = 0, cta_fit = 0 } = parsed;
    const total = Math.round(((specificity + vertical_fit + persona_fit + proof_fit + cta_fit) / 5) * 10) / 10;

    return { specificity, vertical_fit, persona_fit, proof_fit, cta_fit, total };
  } catch {
    return null;
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

interface CellEnrichOptions {
  client_id: string;
}

export async function runCellEnrich(opts: CellEnrichOptions): Promise<Record<string, unknown>> {
  const { client_id } = opts;

  const supabase = createClient(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!
  );

  const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  try {
    if (!client_id) {
      return { success: false, error: 'Missing client_id', request_id: requestId };
    }

    // Read messaging output from workflow_metrics (written by gtm-messaging-doc)
    const { data: client, error: fetchError } = await supabase
      .from('clients')
      .select('id, name, workflow_metrics')
      .eq('id', client_id)
      .single();

    if (fetchError || !client) {
      return { success: false, error: `Client not found: ${fetchError?.message}`, request_id: requestId };
    }

    const wm = (client.workflow_metrics as Record<string, unknown>) ?? {};
    const messagingOutput = (wm.messaging_output as Array<Record<string, unknown>>) ?? [];

    if (messagingOutput.length === 0) {
      return { success: false, error: 'No messaging output found — run gtm-messaging-doc first', request_id: requestId };
    }

    let enriched = 0;
    let messagingRevision = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const entry of messagingOutput) {
      const cellCode = entry.cell_code as string;

      if (!cellCode) {
        skipped++;
        continue;
      }

      // Fetch existing cell to merge brief (preserves aleads_config and sourcing fields)
      const { data: existingCell, error: cellFetchError } = await supabase
        .from('campaign_cells')
        .select('id, brief, status, signal_tier, campaign_archetype')
        .eq('cell_code', cellCode)
        .eq('client_id', client_id)
        .single();

      if (cellFetchError || !existingCell) {
        errors.push(`Cell not found: ${cellCode}`);
        skipped++;
        continue;
      }

      const existingBrief = (existingCell.brief as Record<string, unknown>) ?? {};

      // Resolve formula for this cell
      const personaKey = (entry.persona_key ?? existingBrief.persona_key ?? 'cx') as PersonaKey;
      const verticalKey = (entry.vertical_key ?? existingBrief.vertical_key ?? 'generic') as VerticalKey;
      const signalTier = (existingCell.signal_tier ?? 3) as 1 | 2 | 3 | 4;
      const archetype = (existingCell.campaign_archetype ?? 'matrix_driven') as 'matrix_driven' | 'data_driven' | 'signal_driven';

      const resolverOutput = resolveFormula({
        persona_key: personaKey,
        vertical_key: verticalKey,
        signal_tier: signalTier,
        archetype,
      });

      // ── QA Layer 1 ────────────────────────────────────────────────────────
      const layer1 = runLayer1QA(entry, personaKey, verticalKey);

      // ── QA Layer 2 ────────────────────────────────────────────────────────
      let qaScore: QAScore | null = null;
      if (layer1.passed) {
        qaScore = await runLayer2QA(entry, resolverOutput as unknown as Record<string, unknown>);
      }

      // ── Status determination ───────────────────────────────────────────────
      let determinedStatus: string;
      if (!layer1.passed) {
        determinedStatus = 'messaging_revision';
      } else if (qaScore !== null && qaScore.total < 7.0) {
        determinedStatus = 'messaging_revision';
      } else {
        determinedStatus = 'ready';
      }

      // ── Build update payload ───────────────────────────────────────────────
      const qaResult = {
        score: qaScore,
        layer1_passed: layer1.passed,
        layer1_failures: layer1.failures,
        evaluated_at: new Date().toISOString(),
      };

      const testPlan = {
        h1_variants: resolverOutput.allowed_hook_variants,
        f1_variants: resolverOutput.allowed_offer_variants,
        cta1_variants: resolverOutput.allowed_cta_variants,
      };

      const updatePayload: Record<string, unknown> = {
        brief: {
          ...existingBrief,
          hook_frameworks: entry.hook_frameworks ?? null,
          cta_directions: entry.cta_directions ?? null,
          trigger_alignment: entry.trigger_alignment ?? null,
          signal_to_pain: entry.signal_to_pain_mapping ?? null,
          proof_angle: entry.proof_angle ?? null,
          objection_angle: entry.objection_angle ?? null,
          estimated_addressable_accounts: existingBrief.estimated_addressable_accounts ?? null,
          feasibility_notes: existingBrief.feasibility_notes ?? (entry.notes as string | null) ?? null,
          qa: qaResult,
          test_plan: testPlan,
        },
        status: determinedStatus,
      };

      // Only set variant columns when QA passes
      if (determinedStatus === 'ready') {
        updatePayload.hook_variant = resolverOutput.default_hook_variant;
        updatePayload.offer_variant = resolverOutput.default_offer_variant;
        updatePayload.cta_variant = resolverOutput.default_cta_variant;
      }

      const { error: updateError } = await supabase
        .from('campaign_cells')
        .update(updatePayload)
        .eq('id', existingCell.id);

      if (updateError) {
        errors.push(`Failed to enrich ${cellCode}: ${updateError.message}`);
        skipped++;
      } else if (determinedStatus === 'messaging_revision') {
        messagingRevision++;
      } else {
        enriched++;
      }
    }

    console.log(
      `[${requestId}] Cell enrich for client ${client_id}: ${enriched} enriched, ` +
      `${messagingRevision} messaging_revision, ${skipped} skipped`
    );

    if (errors.length > 0) {
      console.error(`[${requestId}] Enrich errors:`, errors.join(' | '));
    }

    return {
      success: true,
      client_id,
      total_messaging_entries: messagingOutput.length,
      enriched,
      messaging_revision: messagingRevision,
      skipped,
      qa_summary: {
        passed: enriched,
        failed: messagingRevision,
      },
      errors: errors.length > 0 ? errors : undefined,
      request_id: requestId,
    };

  } catch (error) {
    const msg = (error as Error).message;
    console.error(`[${requestId}] Unhandled error:`, msg);
    return { success: false, error: msg, request_id: requestId };
  }
}
