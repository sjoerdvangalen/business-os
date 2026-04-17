// Business OS - Core TypeScript Interfaces
// Based on Supabase schema from CLAUDE.md

// ============================================================================
// ENUM TYPES (based on database enums)
// ============================================================================

export type ClientLifecycleStatus =
  | 'onboarding'
  | 'running'
  | 'scaling'
  | 'paused'
  | 'offboarding'
  | 'churned'

export type ClientStageType =
  | 'intake'
  | 'internal_approval'
  | 'external_sent'
  | 'external_iteration'
  | 'external_approved'
  | 'h1'
  | 'f1'
  | 'cta1'
  | 'scaling'

export type StrategyApprovalStatus =
  | 'draft'
  | 'synthesized'
  | 'internal_review'
  | 'internal_approved'
  | 'external_sent'
  | 'external_iteration'
  | 'external_approved'

export type CampaignHealthStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN'

export type CampaignStatus = 'active' | 'paused' | 'completed' | 'draft'

export type EmailInboxStatus =
  | 'connected'
  | 'disconnected'
  | 'bouncing'
  | 'active'
  | 'removed'
  | 'paused'
  | 'disabled'

export type CampaignCellStatus =
  | 'sourcing_pending'
  | 'sourcing_failed'
  | 'messaging_revision'
  | 'ready'
  | 'H1_testing'
  | 'H1_winner'
  | 'F1_testing'
  | 'F1_winner'
  | 'CTA1_testing'
  | 'soft_launch'
  | 'scaling'
  | 'killed'

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'converted'
  | 'lost'

export type MeetingStatus = 'confirmed' | 'pending' | 'cancelled' | 'completed'

export type OpportunityStage =
  | 'new'
  | 'qualified'
  | 'proposal'
  | 'negotiation'
  | 'closed_won'
  | 'closed_lost'

// ============================================================================
// CORE INTERFACES
// ============================================================================

export interface Client {
  id: string
  code: string
  name: string
  status: ClientLifecycleStatus
  stage: ClientStageType | null
  approval_status: StrategyApprovalStatus | null
  slack_channel_id: string | null
  onboarding_form: Record<string, unknown> | null
  workflow_metrics: Record<string, unknown> | null
  dnc_entities: Record<string, unknown> | null
  gtm_synthesis: Record<string, unknown> | null // DEPRECATED_READONLY
  created_at: string
  updated_at: string
}

export interface Campaign {
  id: string
  name: string
  client_id: string
  status: CampaignStatus
  health_status: CampaignHealthStatus | null
  provider: 'emailbison' | 'manual' | null
  provider_campaign_id: string | null
  reply_rate: number | null
  bounce_rate: number | null
  total_sent: number | null
  total_replied: number | null
  total_bounced: number | null
  plusvibe_id: string | null // legacy
  created_at: string
  updated_at: string
}

export interface CampaignCell {
  id: string
  client_id: string
  strategy_id: string | null
  cell_code: string // Format: CLIENT|EN|solution-key|icp-key|vertical-key|persona-key|geo
  cell_slug: string
  solution_key: string
  icp_key: string
  vertical_key: string
  persona_key: string
  solution_name: string | null
  segment_name: string | null
  persona_name: string | null
  language: string | null
  region: string | null
  geo: string | null
  status: CampaignCellStatus
  campaign_archetype: 'matrix_driven' | 'data_driven' | 'signal_driven' | null
  signal_tier: number | null
  hook_variant: string | null
  offer_variant: string | null
  cta_variant: string | null
  snapshot: Record<string, unknown> | null // Immutable copy of strategy data at cell creation
  brief: CampaignCellBrief | null // See below for structure
  created_at: string
  updated_at: string
}

export interface CampaignCellBrief {
  // Skeleton fields (after cell-seed)
  target_job_title_families?: string[]
  trigger_event_classes?: string[]
  aleads_config?: Record<string, unknown>
  customer_term?: string
  expert_term?: string
  geo?: string

  // Enriched fields (after messaging_approve)
  hook_frameworks?: {
    ERIC?: {
      pattern: string
      examples: string[]
      bullets?: string[]
    }
    HUIDIG?: {
      pattern: string
      examples: string[]
      bullets?: string[]
    }
  }
  cta_directions?: {
    locked: ('info_send' | 'case_study_send')[]
    variants?: string[]
  }
  trigger_alignment?: string
  signal_to_pain?: string
  proof_angle?: string
  objection_angle?: string
  feasibility_notes?: string
  estimated_addressable_accounts?: number

  // Copy engine v2 fields
  test_plan?: {
    h1_variants: string[]
    f1_variants: string[]
    cta1_variants: string[]
  }
  qa?: {
    score: {
      specificity: number
      vertical_fit: number
      persona_fit: number
      proof_fit: number
      cta_fit: number
      total: number
    } | null
    layer1_passed: boolean
    layer1_failures: string[]
    evaluated_at: string
  }
  enrichment_profile?: {
    prompt_template?: string
    account_variables?: string[]
  }
}

export interface Lead {
  id: string
  status: LeadStatus | null
  source: string | null
  campaign_id: string | null
  contact_id: string | null
  company_id: string | null
  client_id: string | null
  created_at: string
  updated_at: string

  // Joined fields (from queries)
  campaigns?: { name: string }
  contacts?: {
    first_name: string
    last_name: string
    email: string
  }
  companies?: { name: string }
}

export interface Meeting {
  id: string
  title: string | null
  description: string | null
  start_time: string
  end_time: string | null
  status: MeetingStatus | null
  provider: 'calcom' | 'ghl' | 'calendly' | string | null
  meeting_url: string | null
  contact_id: string | null
  company_id: string | null
  client_id: string | null
  created_at: string
  updated_at: string

  // Joined fields (from queries)
  contacts?: {
    first_name: string
    last_name: string
    email: string
  }
  companies?: { name: string }
}

export interface Opportunity {
  id: string
  title: string
  value: number | null
  stage: OpportunityStage
  company_id: string | null
  contact_id: string | null
  client_id: string | null
  close_date: string | null
  created_at: string
  updated_at: string

  // Joined fields (from queries)
  companies?: { name: string }
  contacts?: {
    first_name: string
    last_name: string
  }
}

export interface Domain {
  id: string
  domain: string
  client_id: string | null
  spf_status: 'valid' | 'invalid' | 'pending' | null
  dkim_status: 'valid' | 'invalid' | 'pending' | null
  dmarc_status: 'valid' | 'invalid' | 'pending' | null
  dns_records: Record<string, unknown> | null
  health_score: number | null
  created_at: string
  updated_at: string
}

export interface EmailInbox {
  id: string
  email: string
  client_id: string | null
  domain_id: string | null
  status: EmailInboxStatus
  provider_inbox_id: string | null
  warmup_score: number | null
  daily_send_limit: number | null
  sent_today: number | null
  provider: 'emailbison' | null
  created_at: string
  updated_at: string
}

// ============================================================================
// SUPPORTING INTERFACES
// ============================================================================

export interface Company {
  id: string
  name: string
  domain: string | null
  industry: string | null
  size: string | null
  location: string | null
  linkedin_url: string | null
  website: string | null
  created_at: string
  updated_at: string
}

export interface Contact {
  id: string
  client_id: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  title: string | null
  linkedin_url: string | null
  company_id: string | null
  status: string | null
  enrichment_data: Record<string, unknown> | null
  custom_variables: Record<string, unknown> | null
  enriched_at: string | null
  email_verified_at: string | null
  email_catchall: boolean | null
  email_waterfall_status: string | null
  created_at: string
  updated_at: string
}

export interface GtmStrategy {
  id: string
  client_id: string
  version: number
  status: StrategyApprovalStatus
  synthesis: GtmSynthesis | null
  created_at: string
  updated_at: string
}

export interface GtmSynthesis {
  solutions: Array<{
    key: string
    name: string
    description: string
  }>
  qualification_framework: Record<string, unknown>
  icp_segments: Array<{
    key: string
    name: string
    criteria: string[]
  }>
  buyer_personas: Array<{
    key: string
    name: string
    description: string
  }>
  persona_map: Record<string, string[]>
  persona_start_verbs: Record<string, string[]>
  verticals: Array<{
    key: string
    name: string
  }>
  vertical_map: Record<string, string[]>
  vertical_customer_terms: Record<string, string>
  vertical_expert_terms: Record<string, string>
  proof_assets: string[]
  value_prop_formula: string
  campaign_matrix_seed: Array<{
    solution_key: string
    icp_key: string
    vertical_key: string
    persona_key: string
  }>
  messaging_direction: Record<string, unknown>
  research_context: Record<string, unknown>
}

export interface Alert {
  id: string
  memory_type: string
  content: string | null
  metadata: Record<string, unknown> | null
  client_id: string | null
  created_at: string
}

export interface SyncLog {
  id: string
  source: string
  table_name: string
  operation: string
  records_processed: number
  records_failed: number
  error_message: string | null
  completed_at: string
  created_at: string
}

// ============================================================================
// QUERY RESULT TYPES
// ============================================================================

export interface ClientWithCampaigns extends Client {
  campaigns: Campaign[]
}

export interface CampaignWithStats extends Campaign {
  lead_count?: number
  reply_count?: number
  meeting_count?: number
}

export interface ExecutionJob {
  id: string
  job_type: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  client_id: string | null
  payload: Record<string, unknown> | null
  result: Record<string, unknown> | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}
