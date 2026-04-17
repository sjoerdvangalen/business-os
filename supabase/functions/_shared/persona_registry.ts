/**
 * Persona Registry — bullet grammar, signature verbs, banned constructions, validation rules
 *
 * Source: SECX benchmark files (research/SECX-prompt-HUIDIG-*.md)
 * Maturity:
 *   cx:     validated — tested against 30 companies, score 8.2/10 (PRODUCTION READY)
 *   ops:    ready_for_testing — grammar defined, not yet validated at scale
 *   tech:   ready_for_testing — grammar defined, not yet validated at scale
 *   csuite: ready_for_testing — grammar defined, not yet validated at scale
 *
 * Only use patterns that are explicitly defined here. Do not extrapolate from TODO prompts.
 */

export type PersonaKey = 'cx' | 'ops' | 'tech' | 'csuite';
export type MaturityLevel = 'validated' | 'ready_for_testing';

export interface BulletFormula {
  verb: string[];
  structure: string;
  required_phrases: string[];
  example_good: string;
  example_bad?: string;
}

export interface PersonaConfig {
  maturity: MaturityLevel;
  label: string;
  focus: string;
  verbs: {
    b1: string[];
    b2: string[];
    b3: string[];
  };
  bullets: {
    b1: BulletFormula;
    b2: BulletFormula;
    b3: BulletFormula;
  };
  word_count: { min: number; max: number };
  banned_adjectives: string[];
  banned_phrases: string[];
  pain_exclusion_rule: string;
  context_priority: string[];
  word_count_trim_order: string[];
}

export const PERSONA_REGISTRY: Record<PersonaKey, PersonaConfig> = {
  cx: {
    maturity: 'validated',
    label: 'CX Leadership',
    focus: 'Experience, satisfaction, NPS',
    verbs: {
      b1: ['Improve', 'Deliver'],
      b2: ['Route'],
      b3: ['Scale'],
    },
    bullets: {
      b1: {
        verb: ['Improve', 'Deliver'],
        structure: '[Verb] [specific outcome] with seamless handoff from Service Cloud to [specific team/location]',
        required_phrases: ['seamless handoff', 'from Service Cloud to'],
        example_good: 'Improve placement speed with seamless handoff from Service Cloud to recruiters across 12,800 consultants in 33 countries.',
        example_bad: 'Improve expert backlog reduction with handoff from Service Cloud to teams... (wrong outcome + missing "seamless")',
      },
      b2: {
        verb: ['Route'],
        structure: 'Route [specific items] via intent-level pairing based on [criterion 1] and [criterion 2]',
        required_phrases: ['via intent-level pairing based on', ' and '],
        example_good: 'Route candidate inquiries via intent-level pairing based on role type and urgency.',
      },
      b3: {
        verb: ['Scale'],
        structure: 'Scale [specific operation] using AI Supervisor for [specific result] without [pain point]',
        required_phrases: ['using AI Supervisor for', 'without'],
        example_good: 'Scale hiring operations using AI Supervisor for priority handling without consultant burnout.',
      },
    },
    word_count: { min: 12, max: 20 },
    banned_adjectives: ['faster', 'better', 'global', 'digital', 'advanced', 'improved', 'enhanced', 'major', 'key'],
    banned_phrases: ['Deliver project delivery', 'Deliver approval time'],
    pain_exclusion_rule: 'B3 pain point must NOT appear as outcome in B1 (e.g. no "backlog" in both)',
    context_priority: ['scale (employee count, users, assets)', 'location (countries, cities, markets)', 'industry segment (Fortune 1000, healthcare, enterprise)'],
    word_count_trim_order: ['adjectives', 'unnecessary adverbs', 'less important context details'],
  },

  ops: {
    maturity: 'ready_for_testing',
    label: 'Contact Center Operations',
    focus: 'Handle times, SLAs, First Contact Resolution',
    verbs: {
      b1: ['Route'],
      b2: ['Match'],
      b3: ['Hit', 'Maintain'],
    },
    bullets: {
      b1: {
        verb: ['Route'],
        structure: 'Route [inquiries] automatically to [experts] on first contact with seamless handoff from Service Cloud to [specific team]',
        required_phrases: ['automatically', 'on first contact', 'seamless handoff', 'from Service Cloud to'],
        example_good: 'Route user inquiries automatically to specialists on first contact with seamless handoff from Service Cloud to support teams across 33 countries.',
        example_bad: 'Improve response time with seamless handoff... (wrong verb)',
      },
      b2: {
        verb: ['Match'],
        structure: 'Match [requests] by intent to cut [metric with %] via intent-level pairing based on [criterion 1] and [criterion 2]',
        required_phrases: ['by intent to cut', 'via intent-level pairing based on', ' and '],
        example_good: 'Match technical requests by intent to cut handle times 40% via intent-level pairing based on issue type and urgency.',
      },
      b3: {
        verb: ['Hit', 'Maintain'],
        structure: 'Hit [SLA targets] consistently without adding [resource] using AI Supervisor for [specific result] without [pain point]',
        required_phrases: ['without adding'],
        example_good: 'Hit SLA targets consistently without adding tier-1 headcount using AI Supervisor for priority routing without response bottlenecks.',
      },
    },
    word_count: { min: 12, max: 20 },
    banned_adjectives: ['faster', 'better', 'improved', 'enhanced', 'major', 'key', 'critical'],
    banned_phrases: [],
    pain_exclusion_rule: 'B3 pain point must NOT appear as metric in B2',
    context_priority: ['scale (employees, daily volume)', 'location (countries, cities, regions)', 'industry-specific metric (handle time, queue length, abandonment rate)'],
    word_count_trim_order: ['adjectives', '"consistently" if needed', 'less important context details'],
  },

  tech: {
    maturity: 'ready_for_testing',
    label: 'Digital/Tech Leadership',
    focus: 'Integration, automation, APIs',
    verbs: {
      b1: ['Automate'],
      b2: ['Integrate'],
      b3: ['Deploy'],
    },
    bullets: {
      b1: {
        verb: ['Automate'],
        structure: 'Automate [routing/matching] from [source system] to [destination] via API without [integration pain]',
        required_phrases: ['via API', 'without'],
        example_good: 'Automate candidate routing from Service Cloud to recruiters via API without custom coding or middleware.',
        example_bad: 'Improve routing with automated connections... (wrong verb + structure)',
      },
      b2: {
        verb: ['Integrate'],
        structure: 'Integrate [capability] in [timeframe: "days not months/weeks"] using [integration method] based on [criterion 1] and [criterion 2]',
        required_phrases: ['in days not', ' and '],
        example_good: 'Integrate intent-based routing in days not weeks using REST APIs based on role type and urgency.',
      },
      b3: {
        verb: ['Deploy'],
        structure: 'Deploy [capability] without [technical pain] using [technical component] for [specific result] without [deployment blocker]',
        required_phrases: ['without'],
        example_good: 'Deploy AI routing without rebuilding workflows using pre-built connectors for seamless integration without engineering sprints.',
      },
    },
    word_count: { min: 12, max: 20 },
    banned_adjectives: ['faster', 'better', 'improved', 'enhanced', 'major', 'key', 'critical'],
    banned_phrases: [],
    pain_exclusion_rule: 'B3 deployment blocker must differ from B1 integration pain',
    context_priority: ['scale (employees, users, daily volume)', 'location (countries, cities, regions)', 'technical context (CRM platform, ticketing system, cloud stack)'],
    word_count_trim_order: ['adjectives', '"seamlessly" if needed', 'less important context details'],
  },

  csuite: {
    maturity: 'ready_for_testing',
    label: 'C-Suite Executives',
    focus: 'Cost reduction, operational efficiency, ROI',
    verbs: {
      b1: ['Cut'],
      b2: ['Scale'],
      b3: ['Deliver'],
    },
    bullets: {
      b1: {
        verb: ['Cut'],
        structure: 'Cut [cost category] [percentage: "X%"] without [quality loss] using [mechanism] from [system] to [destination]',
        required_phrases: ['without'],
        example_good: 'Cut recruitment costs 40% without quality loss using AI routing from Service Cloud to hiring teams.',
        example_bad: 'Reduce costs and improve efficiency with... (wrong verb + no percentage)',
      },
      b2: {
        verb: ['Scale'],
        structure: 'Scale [operation] [multiple: "2x"/"3x"/"doubling"] without adding [resource] using [mechanism] based on [criterion 1] and [criterion 2]',
        required_phrases: ['without adding', ' and '],
        example_good: 'Scale hiring operations 2x without adding headcount using AI matching based on role type and urgency.',
      },
      b3: {
        verb: ['Deliver'],
        structure: 'Deliver [outcome] at lower [cost metric] without [business risk] using [mechanism] for [specific result]',
        required_phrases: ['at lower', 'without'],
        example_good: 'Deliver placements at lower cost per hire without candidate quality drops using AI Supervisor for faster matching.',
      },
    },
    word_count: { min: 12, max: 20 },
    banned_adjectives: ['faster', 'better', 'improved', 'enhanced', 'major', 'key', 'critical'],
    banned_phrases: [],
    pain_exclusion_rule: 'B3 business risk must differ from B1 quality loss concern',
    context_priority: ['scale (employees, users, daily volume)', 'location (countries, cities, markets)', 'financial context (revenue, AUM, funding, valuation)'],
    word_count_trim_order: ['adjectives', '"significantly" if needed', 'less important context details'],
  },
};
