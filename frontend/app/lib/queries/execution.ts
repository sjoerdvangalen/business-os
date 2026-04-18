import { supabaseAdmin } from '@/lib/supabase/admin'
import type { ExecutionJob, Lead, Meeting, Campaign } from '@/app/types'

/**
 * Get execution jobs with optional filtering
 * Note: This uses sync_log as the underlying table for job tracking
 */
export async function getExecutionJobs(options?: {
  clientId?: string
  status?: 'pending' | 'running' | 'completed' | 'failed'
  source?: string
  limit?: number
}): Promise<ExecutionJob[]> {
  let query = supabaseAdmin
    .from('sync_log')
    .select('*')
    .order('created_at', { ascending: false })

  if (options?.limit) {
    query = query.limit(options.limit)
  } else {
    query = query.limit(100)
  }

  if (options?.source) {
    query = query.eq('source', options.source)
  }

  // Note: sync_log doesn't have a direct status field, so we map from error_message
  if (options?.status) {
    if (options.status === 'failed') {
      query = query.not('error_message', 'is', null)
    } else if (options.status === 'completed') {
      query = query.is('error_message', null).not('completed_at', 'is', null)
    } else if (options.status === 'running') {
      query = query.is('completed_at', null)
    }
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching execution jobs:', error)
    throw new Error(`Failed to fetch execution jobs: ${error.message}`)
  }

  // Map sync_log entries to ExecutionJob format
  return (data || []).map((log: any) => ({
    id: log.id,
    job_type: log.operation,
    status: log.error_message
      ? 'failed'
      : log.completed_at
        ? 'completed'
        : 'running',
    client_id: null, // sync_log doesn't track client_id directly
    payload: {
      source: log.source,
      table_name: log.table_name,
      records_processed: log.records_processed,
      records_failed: log.records_failed,
    },
    result: log.error_message
      ? { error: log.error_message }
      : { records_processed: log.records_processed },
    started_at: log.created_at,
    completed_at: log.completed_at,
    created_at: log.created_at,
  }))
}

/**
 * Get recent execution activity for a client
 * Combines data from leads, meetings, and email_threads
 */
export async function getClientExecutionActivity(clientCode: string): Promise<{
  recentLeads: Lead[]
  recentMeetings: Meeting[]
  recentReplies: Array<{
    id: string
    direction: string
    subject: string | null
    created_at: string
    contact_email: string | null
  }>
  stats: {
    leadsToday: number
    leadsThisWeek: number
    meetingsThisWeek: number
    repliesToday: number
  }
}> {
  // Get client ID
  const { data: client, error: clientError } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('code', clientCode.toUpperCase())
    .single()

  if (clientError || !client) {
    return {
      recentLeads: [],
      recentMeetings: [],
      recentReplies: [],
      stats: {
        leadsToday: 0,
        leadsThisWeek: 0,
        meetingsThisWeek: 0,
        repliesToday: 0,
      },
    }
  }

  const clientId = client.id

  // Calculate date ranges
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayIso = today.toISOString()

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  weekAgo.setHours(0, 0, 0, 0)
  const weekAgoIso = weekAgo.toISOString()

  // Fetch recent leads
  const { data: recentLeads } = await supabaseAdmin
    .from('leads')
    .select(`
      *,
      campaigns(name),
      contacts(first_name, last_name, email),
      companies(name)
    `)
    .eq('client_id', clientId)
    .gte('created_at', weekAgoIso)
    .order('created_at', { ascending: false })
    .limit(10)

  // Fetch recent meetings
  const { data: recentMeetings } = await supabaseAdmin
    .from('meetings')
    .select(`
      *,
      contacts(first_name, last_name, email),
      companies(name)
    `)
    .eq('client_id', clientId)
    .gte('created_at', weekAgoIso)
    .order('created_at', { ascending: false })
    .limit(10)

  // Fetch recent replies (inbound email_threads)
  const { data: recentReplies } = await supabaseAdmin
    .from('email_threads')
    .select(`
      id,
      direction,
      subject,
      created_at,
      contact_email
    `)
    .eq('client_id', clientId)
    .eq('direction', 'inbound')
    .gte('created_at', weekAgoIso)
    .order('created_at', { ascending: false })
    .limit(10)

  // Get stats
  const { count: leadsToday } = await supabaseAdmin
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('created_at', todayIso)

  const { count: leadsThisWeek } = await supabaseAdmin
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('created_at', weekAgoIso)

  const { count: meetingsThisWeek } = await supabaseAdmin
    .from('meetings')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('created_at', weekAgoIso)

  const { count: repliesToday } = await supabaseAdmin
    .from('email_threads')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('direction', 'inbound')
    .gte('created_at', todayIso)

  return {
    recentLeads: recentLeads || [],
    recentMeetings: recentMeetings || [],
    recentReplies: recentReplies || [],
    stats: {
      leadsToday: leadsToday || 0,
      leadsThisWeek: leadsThisWeek || 0,
      meetingsThisWeek: meetingsThisWeek || 0,
      repliesToday: repliesToday || 0,
    },
  }
}

/**
 * Get execution metrics for Command Center dashboard
 */
export async function getExecutionMetrics(): Promise<{
  activeCampaigns: number
  emailsSentToday: number
  emailsSentThisWeek: number
  replyRateToday: number
  replyRateThisWeek: number
  warmupHealth: number
  inboxHealth: number
}> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayIso = today.toISOString()

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  weekAgo.setHours(0, 0, 0, 0)
  const weekAgoIso = weekAgo.toISOString()

  // Get active campaigns count
  const { count: activeCampaigns } = await supabaseAdmin
    .from('campaigns')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')

  // Get email stats - Note: These would typically come from email_threads or campaign stats
  // For now, we'll aggregate from campaigns
  const { data: campaignStats } = await supabaseAdmin
    .from('campaigns')
    .select('total_sent, total_replied')
    .eq('status', 'active')

  const totalSent = campaignStats?.reduce((sum, c) => sum + (c.total_sent || 0), 0) || 0
  const totalReplied = campaignStats?.reduce((sum, c) => sum + (c.total_replied || 0), 0) || 0

  // Get inbox health
  const { data: inboxStats } = await supabaseAdmin
    .from('email_inboxes')
    .select('status, warmup_score')

  const totalInboxes = inboxStats?.length || 0
  const healthyInboxes = inboxStats?.filter(i =>
    ['active', 'connected'].includes(i.status)
  ).length || 0
  const avgWarmup = totalInboxes > 0
    ? (inboxStats?.reduce((sum, i) => sum + (i.warmup_score || 0), 0) || 0) / totalInboxes
    : 0

  // Calculate reply rates (mock calculations based on available data)
  const replyRateToday = totalSent > 0 ? (totalReplied / totalSent) * 100 : 0
  const replyRateThisWeek = replyRateToday // Would be calculated from week data

  return {
    activeCampaigns: activeCampaigns || 0,
    emailsSentToday: totalSent, // Would need time-based filtering
    emailsSentThisWeek: totalSent,
    replyRateToday: Math.round(replyRateToday * 10) / 10,
    replyRateThisWeek: Math.round(replyRateThisWeek * 10) / 10,
    warmupHealth: Math.round(avgWarmup),
    inboxHealth: totalInboxes > 0 ? Math.round((healthyInboxes / totalInboxes) * 100) : 0,
  }
}

/**
 * Get campaign execution queue (campaigns that need attention)
 */
export async function getCampaignExecutionQueue(): Promise<Array<{
  campaign: Campaign
  issues: string[]
  recommendations: string[]
}>> {
  // Get campaigns with health issues
  const { data: unhealthyCampaigns } = await supabaseAdmin
    .from('campaigns')
    .select(`
      *,
      clients(name, code)
    `)
    .in('health_status', ['CRITICAL', 'WARNING'])
    .eq('status', 'active')

  if (!unhealthyCampaigns) {
    return []
  }

  return unhealthyCampaigns.map((campaign: any) => {
    const issues: string[] = []
    const recommendations: string[] = []

    if (campaign.health_status === 'CRITICAL') {
      issues.push('Campaign health is CRITICAL')
      recommendations.push('Pause campaign and review email copy')
      recommendations.push('Check inbox health and warmup status')
    } else if (campaign.health_status === 'WARNING') {
      issues.push('Campaign health is WARNING')
      recommendations.push('Monitor reply rates closely')
      recommendations.push('Consider adjusting targeting')
    }

    if (campaign.bounce_rate && campaign.bounce_rate > 5) {
      issues.push(`High bounce rate: ${campaign.bounce_rate}%`)
      recommendations.push('Review lead quality and validation')
    }

    if (campaign.reply_rate && campaign.reply_rate < 1) {
      issues.push(`Low reply rate: ${campaign.reply_rate}%`)
      recommendations.push('Review messaging and subject lines')
    }

    return {
      campaign,
      issues,
      recommendations,
    }
  })
}

/**
 * Trigger a sync job (placeholder - would call edge function in production)
 */
export async function triggerSyncJob(source: string, operation: string): Promise<{
  success: boolean
  jobId?: string
  error?: string
}> {
  // This is a placeholder that would typically call an edge function
  // to trigger a background job
  console.log(`Triggering sync job: ${source} - ${operation}`)

  return {
    success: true,
    jobId: `mock-job-${Date.now()}`,
  }
}

/**
 * Get daily execution stats for charting
 */
export async function getDailyExecutionStats(days: number = 14): Promise<Array<{
  date: string
  emailsSent: number
  replies: number
  meetings: number
  bounceRate: number
}>> {
  // This would typically aggregate from email_threads
  // For now, return mock data based on campaign totals
  const { data: campaigns } = await supabaseAdmin
    .from('campaigns')
    .select('total_sent, total_replied, bounce_rate')
    .eq('status', 'active')

  const totalSent = campaigns?.reduce((sum, c) => sum + (c.total_sent || 0), 0) || 0
  const totalReplied = campaigns?.reduce((sum, c) => sum + (c.total_replied || 0), 0) || 0
  const avgBounceRate = campaigns?.length
    ? (campaigns.reduce((sum, c) => sum + (c.bounce_rate || 0), 0) / campaigns.length)
    : 0

  // Generate daily breakdown (mock distribution)
  const stats: Array<{
    date: string
    emailsSent: number
    replies: number
    meetings: number
    bounceRate: number
  }> = []

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)

    // Distribute totals across days (mock)
    const daySent = Math.floor(totalSent / days * (0.8 + Math.random() * 0.4))
    const dayReplied = Math.floor(totalReplied / days * (0.8 + Math.random() * 0.4))

    stats.push({
      date: date.toISOString().split('T')[0],
      emailsSent: daySent,
      replies: dayReplied,
      meetings: Math.floor(dayReplied * 0.1), // Assume 10% of replies book meetings
      bounceRate: Math.round(avgBounceRate * 10) / 10,
    })
  }

  return stats
}
