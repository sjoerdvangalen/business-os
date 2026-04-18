import { supabaseAdmin } from '@/lib/supabase/admin'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RotateCw, Clock, CheckCircle2, AlertCircle, Play, Pause } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface SyncJob {
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

interface SourcingRun {
  id: string
  client_id: string
  cell_id: string | null
  run_type: string
  status: string
  businesses_found: number
  businesses_new: number
  contacts_found: number
  contacts_new: number
  contacts_valid: number
  contacts_suppressed: number
  contacts_pushed: number
  started_at: string
  completed_at: string | null
  client?: {
    client_code: string
    name: string
  }
}

interface ExecutionCell {
  id: string
  client_id: string
  status: string
  cell_code: string
  client?: {
    client_code: string
    name: string
  }[]
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

function formatDuration(ms: number | null): string {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'running':
    case 'pending':
      return 'default'
    case 'completed':
      return 'secondary'
    case 'failed':
    case 'error':
      return 'destructive'
    default:
      return 'outline'
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'running':
      return <Play className="h-4 w-4 text-blue-500" />
    case 'pending':
      return <Clock className="h-4 w-4 text-amber-500" />
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    case 'failed':
      return <AlertCircle className="h-4 w-4 text-red-500" />
    default:
      return <Clock className="h-4 w-4 text-slate-400" />
  }
}

export default async function ExecutionPage() {
  const supabase = supabaseAdmin

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  // Fetch recent sync jobs (last 10)
  const { data: syncJobsData, error: syncJobsError } = await supabase
    .from('sync_log')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(10)

  if (syncJobsError) {
    console.error('Error fetching sync jobs:', syncJobsError)
  }

  const syncJobs: SyncJob[] = syncJobsData || []

  // Fetch active sourcing runs
  const { data: sourcingRunsData, error: sourcingRunsError } = await supabase
    .from('sourcing_runs')
    .select(`
      *,
      client:clients(client_code, name)
    `)
    .in('status', ['pending', 'running'])
    .order('started_at', { ascending: false })
    .limit(20)

  if (sourcingRunsError) {
    console.error('Error fetching sourcing runs:', sourcingRunsError)
  }

  const sourcingRuns: SourcingRun[] = sourcingRunsData || []

  // Fetch active campaign executions (cells in testing or active phases)
  const { data: activeCellsData, error: activeCellsError } = await supabase
    .from('campaign_cells')
    .select(`
      id,
      client_id,
      status,
      cell_code,
      client:clients(client_code, name)
    `)
    .in('status', ['H1_testing', 'F1_testing', 'CTA1_testing', 'soft_launch', 'scaling'])
    .order('updated_at', { ascending: false })
    .limit(20)

  if (activeCellsError) {
    console.error('Error fetching active cells:', activeCellsError)
  }

  const activeCells: ExecutionCell[] = activeCellsData || []

  // Calculate stats
  const { data: todayStats, error: todayStatsError } = await supabase
    .from('sync_log')
    .select('records_processed, records_failed, completed_at')
    .gte('started_at', today.toISOString())

  if (todayStatsError) {
    console.error('Error fetching today stats:', todayStatsError)
  }

  const { data: yesterdayFailed, error: yesterdayFailedError } = await supabase
    .from('sync_log')
    .select('records_failed')
    .gte('started_at', yesterday.toISOString())
    .gt('records_failed', 0)

  if (yesterdayFailedError) {
    console.error('Error fetching failed jobs:', yesterdayFailedError)
  }

  // Calculate stats
  const completedToday = todayStats?.filter(j => j.completed_at).length || 0
  const failedLast24h = yesterdayFailed?.length || 0
  const activeJobs = sourcingRuns.filter(r => r.status === 'running').length + activeCells.length
  const pendingJobs = sourcingRuns.filter(r => r.status === 'pending').length
  const queueDepth = sourcingRuns.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Execution</h1>
          <p className="text-muted-foreground">
            Monitor active campaign execution and data pipeline jobs.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            Last updated: {new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' })}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Jobs</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              {activeJobs > 0 ? (
                <RotateCw className="h-5 w-5 animate-spin text-blue-500" />
              ) : null}
              {activeJobs}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">
              {activeCells.length} campaigns · {sourcingRuns.filter(r => r.status === 'running').length} sourcing
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending</CardDescription>
            <CardTitle className="text-2xl">{pendingJobs}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">In queue</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed Today</CardDescription>
            <CardTitle className="text-2xl text-emerald-600">{completedToday}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">Sync jobs finished</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failed</CardDescription>
            <CardTitle className={`text-2xl ${failedLast24h > 0 ? 'text-red-600' : ''}`}>
              {failedLast24h}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">Last 24h</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Queue Depth</CardDescription>
            <CardTitle className="text-2xl">{queueDepth}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">Total pending</p>
          </CardContent>
        </Card>
      </div>

      {/* Execution Queue */}
      <Card>
        <CardHeader>
          <CardTitle>Execution Queue</CardTitle>
          <CardDescription>Pending and running jobs across all clients</CardDescription>
        </CardHeader>
        <CardContent>
          {sourcingRuns.length === 0 && activeCells.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No active jobs in queue</p>
              <p className="text-sm mt-2">Jobs will appear here when scheduled</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job Type</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Campaign executions */}
                {activeCells.map((cell) => (
                  <TableRow key={cell.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {statusIcon('running')}
                        <span className="font-medium">Campaign</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <Badge variant="outline" className="font-mono text-xs">
                          {cell.client?.[0]?.client_code || 'N/A'}
                        </Badge>
                        <p className="text-xs text-slate-500 mt-1">{cell.client?.[0]?.name}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant('running')}>
                        {cell.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      Active
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div className="w-full h-full bg-emerald-500" />
                        </div>
                        <span className="text-xs text-slate-500">Live</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {/* Sourcing runs */}
                {sourcingRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {statusIcon(run.status)}
                        <span className="font-medium capitalize">{run.run_type.replace('_', ' ')}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <Badge variant="outline" className="font-mono text-xs">
                          {run.client?.client_code || 'N/A'}
                        </Badge>
                        <p className="text-xs text-slate-500 mt-1">{run.client?.name}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(run.status)}>
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {timeAgo(run.started_at)}
                    </TableCell>
                    <TableCell>
                      {run.status === 'running' ? (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 transition-all"
                              style={{
                                width: `${Math.min(100, (run.contacts_pushed / Math.max(run.contacts_found, 1)) * 100)}%`
                              }}
                            />
                          </div>
                          <span className="text-xs text-slate-500">
                            {run.contacts_pushed}/{run.contacts_found}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Waiting...</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent Executions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Executions</CardTitle>
          <CardDescription>Last 10 sync operations from all sources</CardDescription>
        </CardHeader>
        <CardContent>
          {syncJobs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No recent executions</p>
              <p className="text-sm mt-2">Completed jobs will appear here</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Operation</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead className="text-right">Records</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncJobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <span className="font-medium">{job.source}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {job.operation}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {job.table_name}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="text-xs">
                        <span className="text-emerald-600">+{job.records_created}</span>
                        {' / '}
                        <span className="text-blue-600">~{job.records_updated}</span>
                        {' / '}
                        <span className="text-slate-400">{job.records_processed}</span>
                        {job.records_failed > 0 && (
                          <>
                            {' / '}
                            <span className="text-red-600">!{job.records_failed}</span>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {job.completed_at ? (
                        <Badge variant="secondary" className="text-xs">Done</Badge>
                      ) : job.records_failed > 0 ? (
                        <Badge variant="destructive" className="text-xs">Failed</Badge>
                      ) : (
                        <Badge variant="default" className="text-xs">Running</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs text-slate-500">
                      {formatDuration(job.duration_ms)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-slate-500">
                      {timeAgo(job.started_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
