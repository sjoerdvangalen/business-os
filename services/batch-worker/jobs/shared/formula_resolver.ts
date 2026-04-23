/**
 * Formula Resolver — merges persona + vertical registry into per-cell constraints
 *
 * Pure/read-only — no DB writes. Provides:
 *   - Grammar constraints for system prompt injection
 *   - Allowed variant sets for H1/F1/CTA1 test logic
 *   - Default variant selections (starting state after messaging_approve)
 *
 * Write responsibility: gtm-campaign-cell-enrich writes defaults + test_plan to campaign_cells
 * after messaging_approve. This resolver just computes.
 */

import { PERSONA_REGISTRY, PersonaKey } from './persona_registry.ts'
import { VERTICAL_REGISTRY, VerticalKey } from './vertical_registry.ts'

export type HookVariant =
  | 'signal_observation'
  | 'data_observation'
  | 'problem_hypothesis'
  | 'poke_the_bear'
  | 'benchmark_gap'
  | 'proof_led'

export type OfferVariant =
  | 'outcome_led'
  | 'problem_led'
  | 'insight_led'
  | 'proof_led'
  | 'diagnostic_led'

export type CtaVariant =
  | 'direct_meeting'
  | 'info_send'
  | 'case_study_send'
  | 'diagnostic_offer'
  | 'soft_confirm'

export type CampaignArchetype = 'matrix_driven' | 'data_driven' | 'signal_driven'

export interface ResolverInput {
  persona_key: PersonaKey
  vertical_key: VerticalKey
  signal_tier: 1 | 2 | 3 | 4
  archetype: CampaignArchetype
  synthesis_context?: SynthesisContext
}

export interface SynthesisContext {
  // Optional overrides from synthesis — client-specific tuning
  persona_registry_overrides?: Partial<Record<PersonaKey, {
    banned_phrases?: string[]
    banned_adjectives?: string[]
  }>>
  proof_assets?: Array<{ type: string; description: string; use_for: string }>
  company_thesis?: string
}

export interface BulletGrammar {
  b1: {
    verb: string[]
    required_phrases: string[]
    structure: string
  }
  b2: {
    verb: string[]
    required_phrases: string[]
    structure: string
  }
  b3: {
    verb: string[]
    required_phrases: string[]
    structure: string
  }
  word_count: { min: number; max: number }
}

export interface ResolverOutput {
  // Grammar constraints — inject into system prompt
  system_prompt_constraints: string
  bullet_grammar: BulletGrammar
  banned_phrases: string[]
  banned_adjectives: string[]
  pain_vocabulary: string[]
  outcome_vocabulary: string[]
  customer_term: string
  expert_term: string

  // Variant sets for H1/F1/CTA1 test logic — not a single definitive choice
  allowed_hook_variants: HookVariant[]
  allowed_offer_variants: OfferVariant[]
  allowed_cta_variants: CtaVariant[]

  // Default starting choice — written to campaign_cells after messaging_approve
  default_hook_variant: HookVariant
  default_offer_variant: OfferVariant
  default_cta_variant: CtaVariant
}

// ── Tier → CTA mapping ──────────────────────────────────────────────────────

const TIER_CTA_MAP: Record<number, CtaVariant[]> = {
  1: ['direct_meeting', 'info_send'],
  2: ['info_send', 'case_study_send'],
  3: ['info_send', 'soft_confirm'],
  4: ['diagnostic_offer', 'soft_confirm'],
}

// ── Archetype → variant sets ─────────────────────────────────────────────────

const ARCHETYPE_HOOK_VARIANTS: Record<CampaignArchetype, HookVariant[]> = {
  matrix_driven: ['signal_observation', 'data_observation', 'problem_hypothesis', 'poke_the_bear', 'benchmark_gap', 'proof_led'],
  data_driven: ['data_observation', 'problem_hypothesis', 'benchmark_gap'],
  signal_driven: ['signal_observation', 'poke_the_bear', 'proof_led'],
}

const ARCHETYPE_OFFER_VARIANTS: Record<CampaignArchetype, OfferVariant[]> = {
  matrix_driven: ['outcome_led', 'problem_led', 'insight_led', 'proof_led', 'diagnostic_led'],
  data_driven: ['diagnostic_led', 'problem_led', 'insight_led'],
  signal_driven: ['outcome_led', 'problem_led', 'proof_led'],
}

// ── Default selections — context-aware ─────────────────────────────────────

function pickDefaultHook(archetype: CampaignArchetype, tier: number): HookVariant {
  if (archetype === 'signal_driven' || tier <= 2) return 'signal_observation'
  if (archetype === 'data_driven') return 'data_observation'
  return 'problem_hypothesis'
}

function pickDefaultOffer(archetype: CampaignArchetype, _tier: number): OfferVariant {
  if (archetype === 'data_driven') return 'diagnostic_led'
  if (archetype === 'signal_driven') return 'outcome_led'
  return 'outcome_led'
}

function pickDefaultCta(tier: number, archetype: CampaignArchetype): CtaVariant {
  if (archetype === 'data_driven') return 'diagnostic_offer'
  const allowed = TIER_CTA_MAP[tier] ?? TIER_CTA_MAP[3]
  return allowed[allowed.length - 1]  // conservative default: info_send or soft_confirm
}

// ── Constraint string builder ────────────────────────────────────────────────

function buildSystemPromptConstraints(
  personaKey: PersonaKey,
  verticalKey: VerticalKey,
  resolvedBannedPhrases: string[],
  resolvedBannedAdjectives: string[],
  customerTerm: string,
  expertTerm: string,
  defaultHook: HookVariant,
  defaultOffer: OfferVariant,
  defaultCta: CtaVariant,
  allowedHooks: HookVariant[],
  allowedOffers: OfferVariant[],
  allowedCtas: CtaVariant[],
): string {
  const persona = PERSONA_REGISTRY[personaKey]
  const vertical = VERTICAL_REGISTRY[verticalKey]

  return `
PERSONA: ${persona.label} (${personaKey})
Focus: ${persona.focus}

BULLET GRAMMAR — B1:
  Verb: ${persona.bullets.b1.verb.join(' or ')}
  Structure: ${persona.bullets.b1.structure}
  Required phrases: ${persona.bullets.b1.required_phrases.join(', ')}
  Example: ${persona.bullets.b1.example_good}

BULLET GRAMMAR — B2:
  Verb: ${persona.bullets.b2.verb.join(' or ')}
  Structure: ${persona.bullets.b2.structure}
  Required phrases: ${persona.bullets.b2.required_phrases.join(', ')}
  Example: ${persona.bullets.b2.example_good}

BULLET GRAMMAR — B3:
  Verb: ${persona.bullets.b3.verb.join(' or ')}
  Structure: ${persona.bullets.b3.structure}
  Required phrases: ${persona.bullets.b3.required_phrases.join(', ')}
  Example: ${persona.bullets.b3.example_good}

WORD COUNT: ${persona.word_count.min}–${persona.word_count.max} words per bullet
  Trim order: ${persona.word_count_trim_order.join(' → ')}
  NEVER remove: signature verbs, required phrases, metrics

PAIN EXCLUSION: ${persona.pain_exclusion_rule}

VERTICAL: ${vertical.label} (${verticalKey})
  Customer term: "${customerTerm}" (never use "customers" generically)
  Expert term: "${expertTerm}"
  Pains: ${vertical.pains.join(', ')}
  Outcomes for ${personaKey}: ${(vertical.outcomes[personaKey] ?? []).join(', ')}
${Object.keys(vertical.banned_substitutions).length > 0 ? `  Banned substitutions: ${Object.entries(vertical.banned_substitutions).map(([bad, good]) => `"${bad}" → use "${good}"`).join('; ')}` : ''}

BANNED ADJECTIVES: ${resolvedBannedAdjectives.join(', ')}
BANNED PHRASES: ${resolvedBannedPhrases.length > 0 ? resolvedBannedPhrases.join(', ') : 'none'}

VARIANTS:
  Default hook: ${defaultHook}
  Default offer: ${defaultOffer}
  Default CTA: ${defaultCta}
  Allowed hooks: ${allowedHooks.join(', ')}
  Allowed offers: ${allowedOffers.join(', ')}
  Allowed CTAs: ${allowedCtas.join(', ')}
`.trim()
}

// ── Key normalisation — synthesis keys → registry canonical keys ─────────────

const PERSONA_KEY_MAP: Record<string, PersonaKey> = {
  // cx variants
  'cx': 'cx', 'cx-manager': 'cx', 'cx_manager': 'cx',
  'cx-director': 'cx', 'cx_director': 'cx', 'customer-experience': 'cx',
  'vp-cx': 'cx', 'head-of-cx': 'cx',
  // ops variants
  'ops': 'ops', 'ops-manager': 'ops', 'ops_manager': 'ops',
  'operations-manager': 'ops', 'head-of-ops': 'ops',
  // tech variants
  'tech': 'tech', 'tech-lead': 'tech', 'cto': 'tech',
  'vp-engineering': 'tech', 'head-of-technology': 'tech', 'it-manager': 'tech',
  // csuite variants
  'csuite': 'csuite', 'c-suite': 'csuite', 'ceo': 'csuite',
  'coo': 'csuite', 'cfo': 'csuite', 'managing-director': 'csuite',
  'founder': 'csuite', 'owner': 'csuite',
}

const VERTICAL_KEY_MAP: Record<string, VerticalKey> = {
  // saas
  'saas': 'saas', 'software': 'saas', 'tech': 'saas',
  // staffing
  'staffing': 'staffing', 'recruitment': 'staffing', 'hr': 'staffing',
  // financial
  'financial': 'financial', 'finance': 'financial', 'banking': 'financial',
  'insurance': 'financial', 'fintech': 'financial',
  // healthcare
  'healthcare': 'healthcare', 'medical': 'healthcare', 'pharma': 'healthcare',
  // manufacturing
  'manufacturing': 'manufacturing', 'logistics': 'manufacturing',
  'supply-chain': 'manufacturing',
  // retail → generic (no dedicated registry entry yet)
  'retail': 'generic', 'ecommerce': 'generic', 'e-commerce': 'generic',
  'hospitality': 'generic', 'services': 'generic',
  // generic fallback
  'generic': 'generic',
}

function normalisePersonaKey(key: string): PersonaKey {
  const mapped = PERSONA_KEY_MAP[key.toLowerCase()]
  if (mapped) return mapped
  // prefix match — e.g. 'cx-something-else' → 'cx'
  for (const [prefix, canonical] of Object.entries(PERSONA_KEY_MAP)) {
    if (key.toLowerCase().startsWith(prefix)) return canonical
  }
  return 'cx'  // safe fallback
}

function normaliseVerticalKey(key: string): VerticalKey {
  const mapped = VERTICAL_KEY_MAP[key.toLowerCase()]
  if (mapped) return mapped
  return 'generic'  // safe fallback
}

// ── Main resolver ────────────────────────────────────────────────────────────

export function resolveFormula(input: ResolverInput): ResolverOutput {
  const { persona_key, vertical_key, signal_tier, archetype, synthesis_context } = input

  const resolvedPersonaKey = normalisePersonaKey(persona_key)
  const resolvedVerticalKey = normaliseVerticalKey(vertical_key)

  const persona = PERSONA_REGISTRY[resolvedPersonaKey]
  const vertical = VERTICAL_REGISTRY[resolvedVerticalKey]

  if (!persona) throw new Error(`Unknown persona_key: ${persona_key} (resolved: ${resolvedPersonaKey})`)
  if (!vertical) throw new Error(`Unknown vertical_key: ${vertical_key} (resolved: ${resolvedVerticalKey})`)

  const tier = Math.max(1, Math.min(4, signal_tier)) as 1 | 2 | 3 | 4

  // Merge base registry with optional client-level overrides from synthesis
  const overrides = synthesis_context?.persona_registry_overrides?.[resolvedPersonaKey]
  const resolvedBannedAdjectives = [
    ...persona.banned_adjectives,
    ...(overrides?.banned_adjectives ?? []),
  ]
  const resolvedBannedPhrases = [
    ...persona.banned_phrases,
    ...(overrides?.banned_phrases ?? []),
  ]

  // Variant sets
  const allowedHooks = ARCHETYPE_HOOK_VARIANTS[archetype]
  const allowedOffers = ARCHETYPE_OFFER_VARIANTS[archetype]
  const allowedCtas = TIER_CTA_MAP[tier] ?? TIER_CTA_MAP[3]

  const defaultHook = pickDefaultHook(archetype, tier)
  const defaultOffer = pickDefaultOffer(archetype, tier)
  const defaultCta = pickDefaultCta(tier, archetype)

  const customerTerm = vertical.customer_term
  const expertTerm = vertical.expert_term

  const bullet_grammar: BulletGrammar = {
    b1: {
      verb: persona.bullets.b1.verb,
      required_phrases: persona.bullets.b1.required_phrases,
      structure: persona.bullets.b1.structure,
    },
    b2: {
      verb: persona.bullets.b2.verb,
      required_phrases: persona.bullets.b2.required_phrases,
      structure: persona.bullets.b2.structure,
    },
    b3: {
      verb: persona.bullets.b3.verb,
      required_phrases: persona.bullets.b3.required_phrases,
      structure: persona.bullets.b3.structure,
    },
    word_count: persona.word_count,
  }

  const systemPromptConstraints = buildSystemPromptConstraints(
    resolvedPersonaKey,
    resolvedVerticalKey,
    resolvedBannedPhrases,
    resolvedBannedAdjectives,
    customerTerm,
    expertTerm,
    defaultHook,
    defaultOffer,
    defaultCta,
    allowedHooks,
    allowedOffers,
    allowedCtas,
  )

  return {
    system_prompt_constraints: systemPromptConstraints,
    bullet_grammar,
    banned_phrases: resolvedBannedPhrases,
    banned_adjectives: resolvedBannedAdjectives,
    pain_vocabulary: vertical.pains,
    outcome_vocabulary: vertical.outcomes[resolvedPersonaKey] ?? [],
    customer_term: customerTerm,
    expert_term: expertTerm,
    allowed_hook_variants: allowedHooks,
    allowed_offer_variants: allowedOffers,
    allowed_cta_variants: allowedCtas,
    default_hook_variant: defaultHook,
    default_offer_variant: defaultOffer,
    default_cta_variant: defaultCta,
  }
}
