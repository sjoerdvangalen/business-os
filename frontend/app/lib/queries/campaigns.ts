import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Campaign, CampaignWithStats, CampaignHealthStatus, CampaignStatus } from '@/app/types'

/**
 * Get all campaigns with optional filtering
 */
export async function getCampaigns(options?: {
  clientId?: string
  status?: CampaignStatus
  healthStatus?: CampaignHealthStatus
  provider?: 'emailbison' | 'manual'
}): Promise<Campaign[]> {
  let query = supabaseAdmin
    .from('campaigns')
    .select('*')
    .order('name')

  if (options?.clientId) {
    query = query.eq('client_id', options.clientId)
  }

  if (options?.status) {
    query = query.eq('status', options.status)
  }

  if (options?.healthStatus) {
    query = query.eq('health_status', options.healthStatus)
  }

  if (options?.provider) {
    query = query.eq('provider', options.provider)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching campaigns:', error)
    throw new Error(`Failed to fetch campaigns: ${error.message}`)
  }

  return data || []
}

/**
 * Get campaigns for a specific client by client code
 */
export async function getCampaignsByClientCode(clientCode: string): Promise<Campaign[]> {
  // First get the client ID from code
  const { data: client, error: clientError } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('code', clientCode.toUpperCase())
    .single()

  if (clientError) {
    console.error('Error fetching client:', clientError)
    throw new Error(`Failed to fetch client: ${clientError.message}`)
  }

  if (!client) {
    return []
  }

  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('client_id', client.id)
    .order('name')

  if (error) {
    console.error('Error fetching campaigns by client:', error)
    throw new Error(`Failed to fetch campaigns: ${error.message}`)
  }

  return data || []
}

/**
 * Get campaigns for a specific client by client ID
 */
export async function getCampaignsByClientId(clientId: string): Promise<Campaign[]> {
  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('client_id', clientId)
    .order('name')

  if (error) {
    console.error('Error fetching campaigns by client ID:', error)
    throw new Error(`Failed to fetch campaigns: ${error.message}`)
  }

  return data || []
}

/**
 * Get a single campaign by ID
 */
export async function getCampaignById(campaignId: string): Promise<Campaign | null> {
  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    console.error('Error fetching campaign:', error)
    throw new Error(`Failed to fetch campaign: ${error.message}`)
  }

  return data
}

/**
 * Get campaign with stats (lead count, reply count, etc.)
 */
export async function getCampaignWithStats(campaignId: string): Promise<CampaignWithStats | null> {
  const { data: campaign, error: campaignError } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single()

  if (campaignError) {
    if (campaignError.code === 'PGRST116') {
      return null
    }
    console.error('Error fetching campaign:', campaignError)
    throw new Error(`Failed to fetch campaign: ${campaignError.message}`)
  }

  // Get lead counts
  const { count: leadCount, error: leadError } = await supabaseAdmin
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)

  if (leadError) {
    console.error('Error fetching lead count:', leadError)
  }

  // Get reply count from email_threads
  const { count: replyCount, error: replyError } = await supabaseAdmin
    .from('email_threads')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('direction', 'inbound')

  if (replyError) {
    console.error('Error fetching reply count:', replyError)
  }

  // Get meeting count
  const { count: meetingCount, error: meetingError } = await supabaseAdmin
    .from('meetings')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)

  if (meetingError) {
    console.error('Error fetching meeting count:', meetingError)
  }

  return {
    ...campaign,
    lead_count: leadCount || 0,
    reply_count: replyCount || 0,
    meeting_count: meetingCount || 0,
  }
}

/**
 * Get active campaigns with health checks
 */
export async function getActiveCampaignsWithHealth(): Promise<Campaign[]> {
  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('status', 'active')
    .order('health_status', { ascending: false }) // CRITICAL first

  if (error) {
    console.error('Error fetching active campaigns:', error)
    throw new Error(`Failed to fetch campaigns: ${error.message}`)
  }

  return data || []
}

/**
 * Get campaigns needing attention (CRITICAL or WARNING health)
 */
export async function getCampaignsNeedingAttention(): Promise<Campaign[]> {
  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .or('health_status.eq.CRITICAL,health_status.eq.WARNING')
    .order('health_status')

  if (error) {
    console.error('Error fetching campaigns needing attention:', error)
    throw new Error(`Failed to fetch campaigns: ${error.message}`)
  }

  return data || []
}

/**
 * Update campaign status
 */
export async function updateCampaignStatus(
  campaignId: string,
  status: CampaignStatus
): Promise<Campaign> {
  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', campaignId)
    .select()
    .single()

  if (error) {
    console.error('Error updating campaign status:', error)
    throw new Error(`Failed to update campaign: ${error.message}`)
  }

  return data
}

/**
 * Update campaign health status
 */
export async function updateCampaignHealthStatus(
  campaignId: string,
  healthStatus: CampaignHealthStatus
): Promise<Campaign> {
  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .update({
      health_status: healthStatus,
      updated_at: new Date().toISOString()
    })
    .eq('id', campaignId)
    .select()
    .single()

  if (error) {
    console.error('Error updating campaign health status:', error)
    throw new Error(`Failed to update campaign health: ${error.message}`)
  }

  return data
}

/**
 * Get campaign performance summary
 */
export async function getCampaignPerformanceSummary(clientId?: string): Promise<{
  total: number
  active: number
  paused: number
  healthy: number
  warning: number
  critical: number
  totalSent: number
  totalReplied: number
  avgReplyRate: number
}> {
  let query = supabaseAdmin.from('campaigns').select('*')

  if (clientId) {
    query = query.eq('client_id', clientId)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching campaign summary:', error)
    throw new Error(`Failed to fetch campaign summary: ${error.message}`)
  }

  const campaigns = data || []

  const total = campaigns.length
  const active = campaigns.filter(c => c.status === 'active').length
  const paused = campaigns.filter(c => c.status === 'paused').length
  const healthy = campaigns.filter(c => c.health_status === 'HEALTHY').length
  const warning = campaigns.filter(c => c.health_status === 'WARNING').length
  const critical = campaigns.filter(c => c.health_status === 'CRITICAL').length

  const totalSent = campaigns.reduce((sum, c) => sum + (c.total_sent || 0), 0)
  const totalReplied = campaigns.reduce((sum, c) => sum + (c.total_replied || 0), 0)
  const avgReplyRate = totalSent > 0 ? (totalReplied / totalSent) * 100 : 0

  return {
    total,
    active,
    paused,
    healthy,
    warning,
    critical,
    totalSent,
    totalReplied,
    avgReplyRate,
  }
}
