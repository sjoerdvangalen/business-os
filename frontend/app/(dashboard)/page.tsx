import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import ClientBarChart from '@/app/components/ClientBarChart'
import ClientLineChart from '@/app/components/ClientLineChart'
import ReplyDonutChart from '@/app/components/ReplyDonutChart'
import MeetingsAreaChart from '@/app/components/MeetingsAreaChart'
import ReplyRateChart from '@/app/components/ReplyRateChart'

// Force dynamic rendering (data changes frequently)
export const dynamic = 'force-dynamic'

interface ClientWithCampaigns {
  id: string
  client_code: string
  name: string
  status: string
  stage: string | null
  approval_status: string | null
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

function healthBadgeVariant(health: string | null): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (health) {
    case 'CRITICAL': return 'destructive'
    case 'WARNING': return 'default'
    case 'HEALTHY': return 'secondary'
    default: return 'outline'
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

function getLast7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (6 - i))
    return date.toLocaleDateString('en-US', { weekday: 'short' })
  })
}

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
      client_code,
      name,
      status,
      stage,
      approval_status,
      slack_channel_id,
      campaigns:campaigns(id, status, health_status, reply_rate, bounce_rate, total_sent, plusvibe_id)
    `)
    .neq('status', 'churned')
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

  const totalReplies = replyData?.length || 0
  const totalMeetings30d = meetings.filter(m => m.booking_status === 'booked').length
  const qualifiedMeetings30d = meetings.filter(m => m.booking_status === 'qualified').length
  const avgReplyRate = totalSent > 0 ? (totalReplies / totalSent * 100) : 0

  // Pending reviews
  const pendingReviews = meetings.filter(m =>
    m.booking_status === 'booked' &&
    new Date(m.start_time || m.created_at) < new Date()
  )

  // Prepare chart data
  const chartData = clients
    .filter(c => c.campaigns.some(camp => camp.total_sent && camp.total_sent > 0))
    .map(c => ({
      name: c.client_code,
      sent: c.campaigns.reduce((sum, camp) => sum + (camp.total_sent || 0), 0)
    }))
    .sort((a, b) => b.sent - a.sent)
    .slice(0, 8)

  // Line chart data
  const last7Days = getLast7Days()
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const { data: emailThreadsData } = await supabase
    .from('email_threads')
    .select('created_at, direction')
    .gte('created_at', sevenDaysAgo.toISOString())

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

  // Area chart data
  const last14Days = getLast14Days()
  const dailyMeetings: Record<string, { booked: number; qualified: number }> = {}
  last14Days.forEach(day => { dailyMeetings[day] = { booked: 0, qualified: 0 } })

  meetings.forEach(meeting => {
    const date = new Date(meeting.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    if (dailyMeetings[date]) {
      if (meeting.booking_status === 'booked' || meeting.booking_status === 'qualified') {
        dailyMeetings[date].booked++
      }
      if (meeting.booking_status === 'qualified') {
        dailyMeetings[date].qualified++
      }
    }
  })

  const areaChartData = last14Days.map(date => ({
    date,
    meetings: dailyMeetings[date]?.booked || 0,
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
        name: c.client_code,
        rate: avgRate * 100,
      }
    })
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 8)

  // Table rows
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
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Emails Sent</CardDescription>
            <CardTitle className="text-3xl">{formatNumber(totalSent)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-400">all time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Replies</CardDescription>
            <CardTitle className="text-3xl">{formatNumber(totalReplies)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-400">{avgReplyRate.toFixed(1)}% rate</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Meetings (30d)</CardDescription>
            <CardTitle className="text-3xl">{totalMeetings30d}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-400">{qualifiedMeetings30d} qualified</p>
          </CardContent>
        </Card>

        <Card className={pendingReviews.length > 0 ? 'border-amber-200' : ''}>
          <CardHeader className="pb-2">
            <CardDescription>Pending Reviews</CardDescription>
            <CardTitle className={`text-3xl ${pendingReviews.length > 0 ? 'text-amber-600' : ''}`}>
              {pendingReviews.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-400">{pendingReviews.length > 0 ? 'action needed' : 'all clear'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Client Cards */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Clients</h2>
        {clients.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-slate-500">
              No active clients found.
            </CardContent>
          </Card>
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
          <Card>
            <CardHeader>
              <CardDescription>Emails Sent per Client</CardDescription>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ClientBarChart data={chartData} />
              ) : (
                <div className="h-64 flex items-center justify-center text-sm text-slate-400">
                  No email data available
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Email Volume Trend (7 Days)</CardDescription>
            </CardHeader>
            <CardContent>
              <ClientLineChart data={lineChartData} clients={['sent', 'replies']} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Reply Classification</CardDescription>
            </CardHeader>
            <CardContent>
              {replyClassificationData.length > 0 ? (
                <ReplyDonutChart data={replyClassificationData} />
              ) : (
                <div className="h-64 flex items-center justify-center text-sm text-slate-400">
                  No reply data available
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Meetings Booked (14 Days)</CardDescription>
            </CardHeader>
            <CardContent>
              <MeetingsAreaChart data={areaChartData} />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardDescription>Reply Rates per Client (%)</CardDescription>
            </CardHeader>
            <CardContent>
              {replyRateData.length > 0 ? (
                <ReplyRateChart data={replyRateData} />
              ) : (
                <div className="h-64 flex items-center justify-center text-sm text-slate-400">
                  No campaign data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Data Table Section */}
      <Card>
        <CardHeader>
          <CardDescription>Recent Alerts & Errors</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Message</TableHead>
                <TableHead className="text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-slate-500">No recent alerts</TableCell>
                </TableRow>
              ) : (
                tableRows.slice(0, 10).map(row => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Badge variant={row.type === 'Error' ? 'destructive' : 'default'}>
                        {row.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[400px] truncate">{row.message}</TableCell>
                    <TableCell className="text-right text-xs text-slate-400">{timeAgo(row.time)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
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
  const avgReplyRate = activeCampaigns.length > 0
    ? activeCampaigns.reduce((sum, c) => sum + (c.reply_rate || 0), 0) / activeCampaigns.length
    : 0
  const clientMeetings30d = meetings.filter(m =>
    m.client_id === client.id && m.booking_status === 'booked'
  ).length
  const totalSent = client.campaigns.reduce((sum, c) => sum + (c.total_sent || 0), 0)
  const criticalCount = client.campaigns.filter(c => c.health_status === 'CRITICAL').length
  const warningCount = client.campaigns.filter(c => c.health_status === 'WARNING').length

  return (
    <Link href={`/clients/${client.client_code}`}>
      <Card className="transition-shadow hover:shadow-md cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${healthColor(overallHealth)}`} />
              <Badge variant="outline" className="font-mono text-xs">
                {client.client_code}
              </Badge>
            </div>
            <span className="text-xs text-slate-400">
              {activeCampaigns.length} campaign{activeCampaigns.length !== 1 ? 's' : ''}
            </span>
          </div>
          <CardTitle className="text-base truncate">{client.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xs text-slate-500">Sent</p>
              <p className="text-sm font-semibold">{formatNumber(totalSent)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Reply %</p>
              <p className={`text-sm font-semibold ${avgReplyRate >= 0.02 ? 'text-emerald-600' : avgReplyRate >= 0.01 ? 'text-slate-800' : 'text-red-600'}`}>
                {(avgReplyRate * 100).toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Meetings</p>
              <p className="text-sm font-semibold">{clientMeetings30d}</p>
            </div>
          </div>

          {(criticalCount > 0 || warningCount > 0) && (
            <div className="mt-3 flex gap-2">
              {criticalCount > 0 && (
                <Badge variant="destructive" className="text-xs">{criticalCount} critical</Badge>
              )}
              {warningCount > 0 && (
                <Badge variant="default" className="text-xs bg-yellow-500">{warningCount} warning</Badge>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 flex-wrap text-xs text-slate-400">
            <span>{client.status}</span>
            {client.stage && (
              <Badge variant="secondary" className="text-xs">{client.stage.replace(/_/g, ' ')}</Badge>
            )}
            {client.approval_status && client.approval_status !== 'draft' && (
              <Badge
                variant={client.approval_status.includes('approved') ? 'secondary' : client.approval_status.includes('rejected') ? 'destructive' : 'outline'}
                className="text-xs"
              >
                {client.approval_status.replace(/_/g, ' ')}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
