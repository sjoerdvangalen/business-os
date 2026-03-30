import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import ClientBarChart from '@/app/components/ClientBarChart'
import ClientLineChart from '@/app/components/ClientLineChart'
import ReplyPieChart from '@/app/components/ReplyPieChart'
import MeetingsAreaChart from '@/app/components/MeetingsAreaChart'
import ReplyRateChart from '@/app/components/ReplyRateChart'

// Revalidate every 60 seconds for live data feel
export const revalidate = 60

// Force dynamic rendering for live data
export const dynamic = 'force-dynamic'

interface ClientWithCampaigns {
  id: string
  code: string
  name: string
  onboarding_status: string
  slack_channel_id: string | null
  campaigns: {
    id: string
    status: string
    health_status: string | null
    reply_rate: number | null
    bounce_rate: number | null
    total_sent: number | null
    plusvibe_id: string
  }[]
}

interface Meeting {
  id: string
  booking_status: string
  created_at: string
  client_id: string | null
  start_time: string | null
}

interface SyncError {
  id: string
  source: string
  table_name: string
  operation: string
  records_failed: number
  error_message: string | null
  completed_at: string
}

interface Alert {
  id: string
  memory_type: string
  content: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

interface ReplyClassification {
  reply_classification: string | null
  count: number
}

interface DailyEmailVolume {
  date: string
  sent: number
  replies: number
}

interface DailyMeetings {
  date: string
  booked: number
  qualified: number
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function healthColor(health: string | null): string {
  switch (health) {
    case 'CRITICAL': return 'bg-red-500'
    case 'WARNING': return 'bg-yellow-500'
    case 'HEALTHY': return 'bg-emerald-500'
    default: return 'bg-slate-400'
  }
}

function healthBg(health: string | null): string {
  switch (health) {
    case 'CRITICAL': return 'border-red-200 bg-red-50'
    case 'WARNING': return 'border-yellow-200 bg-yellow-50'
    default: return 'border-slate-200 bg-white'
  }
}

function calculateOverallHealth(campaigns: { health_status: string | null }[]): string {
  if (campaigns.some(c => c.health_status === 'CRITICAL')) return 'CRITICAL'
  if (campaigns.some(c => c.health_status === 'WARNING')) return 'WARNING'
  if (campaigns.every(c => c.health_status === 'HEALTHY')) return 'HEALTHY'
  return 'UNKNOWN'
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// Generate last 7 days date labels
function getLast7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (6 - i))
    return date.toLocaleDateString('en-US', { weekday: 'short' })
  })
}

// Generate last 14 days date labels
function getLast14Days(): string[] {
  return Array.from({ length: 14 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (13 - i))
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  })
}

export default async function CommandCenter() {
  const supabase = await createClient()

  // Fetch all active clients with their campaigns
  const { data: clientsData, error: clientsError } = await supabase
    .from('clients')
    .select(`
      id,
      code,
      name,
      onboarding_status,
      slack_channel_id,
      campaigns:campaigns(id, status, health_status, reply_rate, bounce_rate, total_sent, plusvibe_id)
    `)
    .neq('onboarding_status', 'archived')
    .order('name')

  if (clientsError) {
    console.error('Error fetching clients:', clientsError)
  }

  const clients: ClientWithCampaigns[] = clientsData || []

  // Fetch meetings from last 30 days
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: meetingsData, error: meetingsError } = await supabase
    .from('meetings')
    .select('id, booking_status, created_at, client_id, start_time')
    .gte('created_at', thirtyDaysAgo.toISOString())

  if (meetingsError) {
    console.error('Error fetching meetings:', meetingsError)
  }

  const meetings: Meeting[] = meetingsData || []

  // Fetch recent sync errors
  const { data: syncErrorsData, error: syncErrorsError } = await supabase
    .from('sync_log')
    .select('*')
    .gt('records_failed', 0)
    .order('completed_at', { ascending: false })
    .limit(5)

  if (syncErrorsError) {
    console.error('Error fetching sync errors:', syncErrorsError)
  }

  const syncErrors: SyncError[] = syncErrorsData || []

  // Fetch recent agent alerts
  const { data: alertsData, error: alertsError } = await supabase
    .from('agent_memory')
    .select('*')
    .eq('memory_type', 'ALERT')
    .order('created_at', { ascending: false })
    .limit(5)

  if (alertsError) {
    console.error('Error fetching alerts:', alertsError)
  }

  const alerts: Alert[] = alertsData || []

  // Fetch reply classification distribution from leads
  const { data: replyData, error: replyError } = await supabase
    .from('leads')
    .select('reply_classification')
    .not('reply_classification', 'is', null)

  if (replyError) {
    console.error('Error fetching reply classifications:', replyError)
  }

  // Calculate reply classification distribution
  const classificationCounts: Record<string, number> = {}
  replyData?.forEach(lead => {
    const classification = lead.reply_classification || 'Unknown'
    classificationCounts[classification] = (classificationCounts[classification] || 0) + 1
  })

  const replyClassificationData = [
    { name: 'Positive', value: classificationCounts['POSITIVE'] || 0 },
    { name: 'Neutral', value: classificationCounts['NEUTRAL'] || 0 },
    { name: 'Info Request', value: classificationCounts['INFO_REQUEST'] || 0 },
    { name: 'Future Request', value: classificationCounts['FUTURE_REQUEST'] || 0 },
    { name: 'Not Interested', value: classificationCounts['NOT_INTERESTED'] || 0 },
    { name: 'Out of Office', value: classificationCounts['OOO'] || 0 },
    { name: 'Blocklist', value: classificationCounts['BLOCKLIST'] || 0 },
  ].filter(item => item.value > 0)

  // Calculate aggregate stats
  const totalSent = clients.reduce((sum, c) =>
    sum + c.campaigns.reduce((campSum, camp) => campSum + (camp.total_sent || 0), 0), 0
  )

  // Get total replies from leads (approximation based on reply_classification)
  const totalReplies = replyData?.length || 0

  const totalMeetings30d = meetings.filter(m => m.booking_status === 'booked').length
  const qualifiedMeetings30d = meetings.filter(m => m.booking_status === 'qualified').length

  const avgReplyRate = totalSent > 0 ? (totalReplies / totalSent * 100) : 0

  // Pending reviews = meetings that need review (booked but not yet reviewed)
  const pendingReviews = meetings.filter(m =>
    m.booking_status === 'booked' &&
    new Date(m.start_time || m.created_at) < new Date()
  )

  // Prepare chart data
  const chartData = clients
    .filter(c => c.campaigns.some(camp => camp.total_sent && camp.total_sent > 0))
    .map(c => ({
      name: c.code,
      sent: c.campaigns.reduce((sum, camp) => sum + (camp.total_sent || 0), 0)
    }))
    .sort((a, b) => b.sent - a.sent)
    .slice(0, 8)

  // Line chart data - aggregate email threads by date (last 7 days)
  const last7Days = getLast7Days()
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const { data: emailThreadsData, error: emailThreadsError } = await supabase
    .from('email_threads')
    .select('created_at, direction')
    .gte('created_at', sevenDaysAgo.toISOString())

  if (emailThreadsError) {
    console.error('Error fetching email threads:', emailThreadsError)
  }

  // Aggregate by date
  const dailyVolume: Record<string, { sent: number; replies: number }> = {}
  last7Days.forEach(day => { dailyVolume[day] = { sent: 0, replies: 0 } })

  emailThreadsData?.forEach(thread => {
    const date = new Date(thread.created_at).toLocaleDateString('en-US', { weekday: 'short' })
    if (dailyVolume[date]) {
      if (thread.direction === 'outbound') {
        dailyVolume[date].sent++
      } else {
        dailyVolume[date].replies++
      }
    }
  })

  const lineChartData = last7Days.map(date => ({
    date,
    sent: dailyVolume[date]?.sent || 0,
    replies: dailyVolume[date]?.replies || 0,
  }))

  // Area chart data - meetings by date (last 14 days)
  const last14Days = getLast14Days()
  const dailyMeetings: Record<string, { booked: number; qualified: number }> = {}
  last14Days.forEach(day => { dailyMeetings[day] = { booked: 0, qualified: 0 } })

  meetings.forEach(meeting => {
    const date = new Date(meeting.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    if (dailyMeetings[date]) {
      if (meeting.booking_status === 'booked' || meeting.booking_status === 'qualified' || meeting.booking_status === 'completed') {
        dailyMeetings[date].booked++
      }
      if (meeting.booking_status === 'qualified') {
        dailyMeetings[date].qualified++
      }
    }
  })

  const areaChartData = last14Days.map(date => ({
    date,
    booked: dailyMeetings[date]?.booked || 0,
    qualified: dailyMeetings[date]?.qualified || 0,
  }))

  // Reply rates per client
  const replyRateData = clients
    .filter(c => c.campaigns.length > 0)
    .map(c => {
      const activeCampaigns = c.campaigns.filter(camp => camp.status === 'ACTIVE')
      const avgRate = activeCampaigns.length > 0
        ? activeCampaigns.reduce((sum, camp) => sum + (camp.reply_rate || 0), 0) / activeCampaigns.length
        : 0
      return {
        name: c.code,
        rate: avgRate * 100, // Convert to percentage
        color: avgRate >= 0.025 ? '#10b981' : avgRate >= 0.015 ? '#3b82f6' : '#f59e0b',
      }
    })
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 8)

  // Table rows combining sync errors and alerts
  const tableRows = [
    ...syncErrors.map(err => ({
      id: err.id,
      type: 'Error' as const,
      message: `${err.source}/${err.table_name} — ${err.operation} failed (${err.records_failed})`,
      time: err.completed_at,
    })),
    ...alerts.map(alert => ({
      id: alert.id,
      type: 'Alert' as const,
      message: alert.content || alert.memory_type,
      time: alert.created_at,
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

  const activeCampaignsCount = clients.reduce(
    (sum, c) => sum + c.campaigns.filter(camp => camp.status === 'ACTIVE').length,
    0
  )

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Command Center</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {clients.length} active clients · {activeCampaignsCount} campaigns running
          </p>
        </div>
        <div className="text-xs text-slate-400">
          Last updated: {new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' })}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Emails Sent" value={formatNumber(totalSent)} sub="all time" />
        <StatCard label="Total Replies" value={formatNumber(totalReplies)} sub={`${avgReplyRate.toFixed(1)}% rate`} />
        <StatCard
          label="Meetings (30d)"
          value={totalMeetings30d.toString()}
          sub={`${qualifiedMeetings30d} qualified`}
        />
        <StatCard
          label="Pending Reviews"
          value={pendingReviews.length.toString()}
          sub={pendingReviews.length > 0 ? 'action needed' : 'all clear'}
          accent={pendingReviews.length > 0}
        />
      </div>

      {/* Client Cards */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Clients</h2>
        {clients.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            No active clients found.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clients.map(client => (
              <ClientCard key={client.id} client={client} meetings={meetings} />
            ))}
          </div>
        )}
      </div>

      {/* Charts Grid */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Analytics</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Chart 1: Emails Sent per Client */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Emails Sent per Client</h3>
            {chartData.length > 0 ? (
              <ClientBarChart data={chartData} />
            ) : (
              <div className="h-64 flex items-center justify-center text-sm text-slate-400">
                No email data available
              </div>
            )}
          </div>

          {/* Chart 2: Email Volume Trend */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Email Volume Trend (7 Days)</h3>
            <ClientLineChart data={lineChartData} />
          </div>

          {/* Chart 3: Reply Classification */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Reply Classification</h3>
            {replyClassificationData.length > 0 ? (
              <ReplyPieChart data={replyClassificationData} />
            ) : (
              <div className="h-64 flex items-center justify-center text-sm text-slate-400">
                No reply data available
              </div>
            )}
          </div>

          {/* Chart 4: Meetings Booked Over Time */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Meetings Booked (14 Days)</h3>
            <MeetingsAreaChart data={areaChartData} />
          </div>

          {/* Chart 5: Reply Rates per Client */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Reply Rates per Client (%)</h3>
            {replyRateData.length > 0 ? (
              <ReplyRateChart data={replyRateData} />
            ) : (
              <div className="h-64 flex items-center justify-center text-sm text-slate-400">
                No campaign data available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Data Table Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Recent Alerts & Errors</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="pb-2 text-left font-medium text-slate-500">Type</th>
                <th className="pb-2 text-left font-medium text-slate-500">Message</th>
                <th className="pb-2 text-right font-medium text-slate-500">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-slate-500">No recent alerts</td>
                </tr>
              ) : (
                tableRows.slice(0, 10).map(row => (
                  <tr key={row.id}>
                    <td className="py-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.type === 'Error' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {row.type}
                      </span>
                    </td>
                    <td className="py-2 max-w-[400px] truncate text-slate-700">{row.message}</td>
                    <td className="py-2 text-right text-xs text-slate-400">{timeAgo(row.time)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Alerts & Errors */}
      {(alerts.length > 0 || syncErrors.length > 0) && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">System Alerts</h2>
          <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
            {syncErrors.map(err => (
              <div key={err.id} className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <ExclamationIcon />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800">
                    <span className="font-medium">{err.source}/{err.table_name}</span>
                    {' '}{err.operation} — {err.records_failed} failed
                  </p>
                  {err.error_message && (
                    <p className="mt-0.5 truncate text-xs text-slate-500">{err.error_message}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-slate-400">
                  {timeAgo(err.completed_at)}
                </span>
              </div>
            ))}
            {alerts.map(alert => (
              <div key={alert.id} className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                  <BellIcon />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800">{alert.content || alert.memory_type}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-400">
                  {timeAgo(alert.created_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Components ──

function StatCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string
  value: string
  sub: string
  accent?: boolean
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? 'text-amber-600' : 'text-slate-900'}`}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-slate-400">{sub}</p>
    </div>
  )
}

function ClientCard({
  client,
  meetings
}: {
  client: ClientWithCampaigns
  meetings: Meeting[]
}) {
  const activeCampaigns = client.campaigns.filter(c => c.status === 'ACTIVE')
  const overallHealth = calculateOverallHealth(client.campaigns)

  // Calculate avg reply rate from campaigns
  const avgReplyRate = activeCampaigns.length > 0
    ? activeCampaigns.reduce((sum, c) => sum + (c.reply_rate || 0), 0) / activeCampaigns.length
    : 0

  // Count meetings for this client in last 30 days
  const clientMeetings30d = meetings.filter(m =>
    m.client_id === client.id &&
    m.booking_status === 'booked'
  ).length

  // Total emails sent for this client
  const totalSent = client.campaigns.reduce((sum, c) => sum + (c.total_sent || 0), 0)

  // Critical/warning counts from campaigns
  const criticalCount = client.campaigns.filter(c => c.health_status === 'CRITICAL').length
  const warningCount = client.campaigns.filter(c => c.health_status === 'WARNING').length

  return (
    <Link
      href={`/clients/${client.code}`}
      className={`block rounded-xl border p-4 transition-shadow hover:shadow-md ${healthBg(overallHealth)}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${healthColor(overallHealth)}`} />
          <span className="font-mono text-xs font-semibold text-slate-500">{client.code}</span>
        </div>
        <span className="text-xs text-slate-400">
          {activeCampaigns.length} campaign{activeCampaigns.length !== 1 ? 's' : ''}
        </span>
      </div>
      <h3 className="mt-1.5 text-sm font-semibold text-slate-900 truncate">{client.name}</h3>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-slate-500">Sent</p>
          <p className="text-sm font-semibold text-slate-800">{formatNumber(totalSent)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Reply %</p>
          <p className={`text-sm font-semibold ${
            avgReplyRate >= 0.02 ? 'text-emerald-600' :
            avgReplyRate >= 0.01 ? 'text-slate-800' : 'text-red-600'
          }`}>
            {(avgReplyRate * 100).toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Meetings</p>
          <p className="text-sm font-semibold text-slate-800">{clientMeetings30d}</p>
        </div>
      </div>

      {/* Health warnings */}
      {(criticalCount > 0 || warningCount > 0) && (
        <div className="mt-2 flex gap-2">
          {criticalCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              {criticalCount} critical
            </span>
          )}
          {warningCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
              {warningCount} warning
            </span>
          )}
        </div>
      )}

      {/* Infrastructure mini-stat */}
      <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
        <span>{client.campaigns.length} total campaigns</span>
        <span>{client.onboarding_status.replace(/_/g, ' ')}</span>
      </div>
    </Link>
  )
}

// ── Helpers ──

function ExclamationIcon() {
  return (
    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  )
}
