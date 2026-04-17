// Database types for Business OS
// Generated based on migrations

export type ClientLifecycle =
  | 'onboarding'
  | 'running'
  | 'scaling'
  | 'paused'
  | 'offboarding'
  | 'churned'

export type ClientStageType =
  | 'intake'
  | 'internal_approval'
  | 'external_approval'
  | 'messaging_approval'
  | 'data_sourcing'
  | 'h1'
  | 'f1'
  | 'cta1'
  | 'scaling'

export type StrategyApproval =
  | 'draft'
  | 'synthesized'
  | 'internal_review'
  | 'internal_approved'
  | 'internal_rejected'
  | 'external_sent'
  | 'external_iteration'
  | 'external_approved'

export interface Client {
  id: string
  name: string
  domain: string | null
  status: ClientLifecycle
  stage: ClientStageType
  approval_status: StrategyApproval
  client_code: string
  language: string | null
  crm_type: string | null
  calendar_type: string | null
  slack_channel_id: string | null
  linkedin_url: string | null
  last_intake_at: string | null
  workflow_metrics: Record<string, unknown> | null
  onboarding_form: Record<string, unknown> | null
  onboarding_form_raw: Record<string, unknown> | null
  exa_research: Record<string, unknown> | null
  strategy_synthesis: Record<string, unknown> | null
  gtm_strategy_doc_url: string | null
  gtm_strategy_doc_external_url: string | null
  messaging_doc_url: string | null
  dnc_entities: Record<string, unknown> | null
  calendar_webhook_token: string | null
  updated_at: string
  created_at: string
}

export interface Campaign {
  id: string
  client_id: string
  name: string
  status: string
  provider: string
  provider_campaign_id: string | null
  total_leads: number
  leads_contacted: number
  leads_completed: number
  emails_sent: number
  unique_opens: number
  replies: number
  positive_replies: number
  neutral_replies: number
  negative_replies: number
  bounces: number
  unsubscribes: number
  open_rate: number | null
  reply_rate: number | null
  bounce_rate: number | null
  positive_rate: number | null
  health_status: string
  last_health_check: string | null
  updated_at: string
  created_at: string
}

export interface Contact {
  id: string
  client_id: string | null
  campaign_id: string | null
  email: string | null
  full_name: string | null
  first_name: string | null
  last_name: string | null
  status: string | null
  lead_status: string | null
  reply_classification: string | null
  company: string | null
  position: string | null
  linkedin_url: string | null
  phone: string | null
  city: string | null
  state: string | null
  country: string | null
  industry: string | null
  lead_source: string | null
  enrichment_data: Record<string, unknown> | null
  custom_variables: Record<string, unknown> | null
  enriched_at: string | null
  email_verified_at: string | null
  email_catchall: boolean | null
  email_waterfall_status: string | null
  opened_count: number
  replied_count: number
  bounced: boolean
  lead_score: number
  created_at: string
  updated_at: string
}

export interface CampaignCell {
  id: string
  client_id: string
  strategy_id: string | null
  cell_code: string
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
  status:
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
  campaign_archetype: 'matrix_driven' | 'data_driven' | 'signal_driven' | null
  signal_tier: number | null
  hook_variant: string | null
  offer_variant: string | null
  cta_variant: string | null
  snapshot: Record<string, unknown> | null
  brief: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface Meeting {
  id: string
  client_id: string
  contact_id: string | null
  name: string | null
  status: string | null
  start_time: string
  end_time: string | null
  created_at: string
  updated_at: string
}

export interface SyncLog {
  id: string
  source: string
  table_name: string
  operation: string
  records_processed: number
  records_created: number
  records_updated: number
  records_failed: number
  error_message: string | null
  started_at: string
  completed_at: string | null
  duration_ms: number | null
}

export interface ClientStats {
  campaigns_count: number
  active_leads_count: number
  meetings_this_month: number
  avg_reply_rate: number | null
}

export interface RecentActivity {
  id: string
  source: string
  table_name: string
  operation: string
  records_processed: number
  started_at: string
  duration_ms: number | null
}
