import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Client, ClientStats, RecentActivity, Campaign, SyncLog } from '@/lib/database.types'

export async function getClientByCode(clientCode: string): Promise<Client | null> {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('*')
    .eq('client_code', clientCode.toUpperCase())
    .single()

  if (error || !data) {
    console.error('Error fetching client:', error)
    return null
  }

  return data as Client
}

export async function getClientStats(clientId: string): Promise<ClientStats> {
  // Get campaigns count
  const { count: campaignsCount, error: campaignsError } = await supabaseAdmin
    .from('campaigns')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)

  if (campaignsError) {
    console.error('Error fetching campaigns count:', campaignsError)
  }

  // Get active leads count (contacts with status = 'active' or lead_status = 'new' | 'contacted')
  const { count: activeLeadsCount, error: leadsError } = await supabaseAdmin
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .in('lead_status', ['new', 'contacted', 'replied'])

  if (leadsError) {
    console.error('Error fetching active leads count:', leadsError)
  }

  // Get meetings booked this month
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const { count: meetingsCount, error: meetingsError } = await supabaseAdmin
    .from('meetings')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('start_time', startOfMonth.toISOString())

  if (meetingsError) {
    console.error('Error fetching meetings count:', meetingsError)
  }

  // Get average reply rate from campaigns
  const { data: campaigns, error: replyRateError } = await supabaseAdmin
    .from('campaigns')
    .select('reply_rate, emails_sent')
    .eq('client_id', clientId)
    .gt('emails_sent', 0)

  let avgReplyRate: number | null = null
  if (!replyRateError && campaigns && campaigns.length > 0) {
    const totalSent = campaigns.reduce((sum, c) => sum + (c.emails_sent || 0), 0)
    const weightedReplySum = campaigns.reduce(
      (sum, c) => sum + ((c.reply_rate || 0) * (c.emails_sent || 0)),
      0
    )
    avgReplyRate = totalSent > 0 ? weightedReplySum / totalSent : null
  }

  return {
    campaigns_count: campaignsCount || 0,
    active_leads_count: activeLeadsCount || 0,
    meetings_this_month: meetingsCount || 0,
    avg_reply_rate: avgReplyRate,
  }
}

export async function getRecentActivity(
  clientId: string,
  limit: number = 5
): Promise<RecentActivity[]> {
  // Try to get sync_log entries first (these are system-wide)
  const { data, error } = await supabaseAdmin
    .from('sync_log')
    .select('id, source, table_name, operation, records_processed, started_at, duration_ms')
    .order('started_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching recent activity:', error)
    return []
  }

  // Map to RecentActivity format
  return (data || []).map((item) => ({
    id: item.id,
    source: item.source,
    table_name: item.table_name,
    operation: item.operation,
    records_processed: item.records_processed || 0,
    started_at: item.started_at,
    duration_ms: item.duration_ms,
  }))
}

export function formatDuration(ms: number | null): string {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  return `${Math.round(ms / 60000)}m`
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)

  if (diffInHours < 1) {
    return 'Just now'
  } else if (diffInHours < 24) {
    return `${Math.round(diffInHours)}h ago`
  } else if (diffInHours < 48) {
    return 'Yesterday'
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }
}

export function getStatusBadgeVariant(
  status: string
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status.toLowerCase()) {
    case 'running':
    case 'active':
    case 'internal_approved':
    case 'external_approved':
      return 'default'
    case 'onboarding':
    case 'synthesized':
    case 'external_sent':
      return 'secondary'
    case 'paused':
    case 'offboarding':
    case 'churned':
    case 'internal_rejected':
      return 'destructive'
    default:
      return 'outline'
  }
}

export function getStageBadgeVariant(
  stage: string
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (stage.toLowerCase()) {
    case 'scaling':
      return 'default'
    case 'h1':
    case 'f1':
    case 'cta1':
      return 'secondary'
    default:
      return 'outline'
  }
}
