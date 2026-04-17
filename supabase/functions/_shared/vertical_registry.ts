/**
 * Vertical Registry — customer terms, expert terms, pains, outcomes, banned substitutions
 *
 * Source: SECX benchmark files (per-vertical examples in each persona prompt)
 * 6 verticals: saas, staffing, financial, healthcare, manufacturing, generic
 */

export type VerticalKey = 'saas' | 'staffing' | 'financial' | 'healthcare' | 'manufacturing' | 'generic';
export type PersonaKeyForVertical = 'cx' | 'ops' | 'tech' | 'csuite';

export interface VerticalConfig {
  label: string;
  customer_term: string;
  expert_term: string;
  pains: string[];
  outcomes: Record<PersonaKeyForVertical, string[]>;
  cost_categories: string[];        // for csuite B1
  business_risks: string[];         // for csuite B3
  sla_pain_points: string[];        // for ops B3 "without adding [resource]" industry pain
  deployment_blockers?: string[];   // for tech B3
  banned_substitutions: Record<string, string>;
}

export const VERTICAL_REGISTRY: Record<VerticalKey, VerticalConfig> = {
  staffing: {
    label: 'Staffing & Recruiting',
    customer_term: 'candidates',
    expert_term: 'recruiters, staffing specialists',
    pains: ['consultant burnout', 'placement delays', 'application black holes', 'SLA misses', 'recruiter headcount pressure'],
    outcomes: {
      cx:     ['placement speed', 'matching quality', 'onboarding accuracy'],
      ops:    ['response time', 'placement throughput', 'FCR on candidate inquiries'],
      tech:   ['routing automation', 'integration deployment', 'skill-based matching'],
      csuite: ['recruitment costs', 'time-to-hire', 'cost per placement'],
    },
    cost_categories: ['recruitment costs', 'time-to-hire'],
    business_risks: ['candidate quality drops', 'missed SLAs'],
    sla_pain_points: ['missed SLAs'],
    banned_substitutions: {},
  },

  financial: {
    label: 'Financial Services & Banking',
    customer_term: 'clients',
    expert_term: 'bankers, relationship managers, advisors',
    pains: ['compliance delays', 'hold times', 'regulatory breaches', 'audit backlogs'],
    outcomes: {
      cx:     ['approval time', 'onboarding accuracy', 'client satisfaction'],
      ops:    ['hold times', 'compliance SLA throughput', 'FCR on client inquiries'],
      tech:   ['priority scoring integration', 'compliance workflow automation'],
      csuite: ['service delivery costs', 'operational expenses', 'cost per transaction'],
    },
    cost_categories: ['service delivery costs', 'operational expenses'],
    business_risks: ['compliance issues', 'regulatory breaches'],
    sla_pain_points: ['compliance breaches'],
    banned_substitutions: {},
  },

  healthcare: {
    label: 'Healthcare',
    customer_term: 'patients',
    expert_term: 'coordinators, specialists, intake teams',
    pains: ['scheduling backlogs', 'compliance delays', 'care coordination gaps', 'intake bottlenecks'],
    outcomes: {
      cx:     ['onboarding accuracy', 'support response', 'care coordination speed'],
      ops:    ['scheduling throughput', 'intake FCR', 'compliance SLA adherence'],
      tech:   ['EMR integration', 'intake automation', 'care pathway routing'],
      csuite: ['administrative costs', 'coordination overhead', 'cost per patient interaction'],
    },
    cost_categories: ['administrative costs', 'coordination overhead'],
    business_risks: ['patient satisfaction decline', 'compliance exposure'],
    sla_pain_points: ['scheduling backlogs'],
    banned_substitutions: {},
  },

  saas: {
    label: 'SaaS / Software',
    customer_term: 'users',
    expert_term: 'product specialists, CSMs',
    pains: ['churn', 'response bottlenecks', 'workflow bottlenecks', 'localization delays', 'onboarding drop-off'],
    outcomes: {
      cx:     ['localization speed', 'content delivery', 'onboarding accuracy', 'support response'],
      ops:    ['turnaround time', 'delivery SLAs', 'FCR on project requests'],
      tech:   ['project routing automation', 'content matching integration', 'workflow automation'],
      csuite: ['support costs', 'customer acquisition costs', 'cost per project', 'deadline misses'],
    },
    cost_categories: ['support costs', 'customer acquisition costs'],
    business_risks: ['churn increase', 'deadline misses'],
    sla_pain_points: ['response bottlenecks'],
    banned_substitutions: {
      'linguist teams': 'specialized linguists',
      'translation teams': 'linguists',
    },
  },

  manufacturing: {
    label: 'Manufacturing & Engineering',
    customer_term: 'clients',
    expert_term: 'engineers, delivery specialists, technical consultants',
    pains: ['expert backlog', 'escalation delays', 'delivery bottlenecks', 'expertise gaps'],
    outcomes: {
      cx:     ['matching quality', 'project delivery', 'onboarding accuracy'],
      ops:    ['resolution time', 'expert routing throughput', 'FCR on technical requests'],
      tech:   ['engineer routing automation', 'skill-based matching integration'],
      csuite: ['project overhead', 'delivery costs', 'cost per project'],
    },
    cost_categories: ['project overhead', 'delivery costs'],
    business_risks: ['delivery delays', 'expertise gaps'],
    sla_pain_points: ['escalation delays'],
    banned_substitutions: {},
  },

  generic: {
    label: 'Generic / Cross-Vertical',
    customer_term: 'customers',
    expert_term: 'specialists, experts',
    pains: ['response delays', 'workflow bottlenecks', 'quality inconsistency', 'scale constraints'],
    outcomes: {
      cx:     ['support response', 'onboarding accuracy', 'service quality'],
      ops:    ['handle times', 'FCR', 'SLA adherence'],
      tech:   ['integration speed', 'automation coverage', 'deployment time'],
      csuite: ['operational costs', 'unit costs', 'cost per interaction'],
    },
    cost_categories: ['operational costs', 'unit costs'],
    business_risks: ['quality drops', 'service degradation'],
    sla_pain_points: ['response bottlenecks'],
    banned_substitutions: {},
  },
};
