import { supabaseAdmin } from '@/lib/supabase/admin'
import Link from 'next/link'

// Force dynamic rendering (data changes frequently)
export const dynamic = 'force-dynamic'

type ClientRow = {
  id: string
  client_code: string
  name: string
  client_stage: string
  active_campaigns: number
  total_campaigns: number
  total_emails_sent: number
  total_replies: number
  total_positive_replies: number
  total_bounces: number
  reply_rate: number
  bounce_rate: number
  critical_count: number
  warning_count: number
  overall_health: string
  email_account_count: number
  connected_accounts: number
  domain_count: number
  meetings_30d: number
  qualified_30d: number
  total_leads: number
  interested_leads: number
  total_contacts: number
}

type AlertRow = {
  id: string
  memory_type: string
  content: string
  metadata: Record<string, unknown>
  created_at: string
}

type SyncLogRow = {
  id: string
  source: string
  table_name: string
  operation: string
  records_failed: number
  error_message: string
  completed_at: string
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function healthColor(health: string): string {
  switch (health) {
    case 'CRITICAL': return 'bg-red-500'
    case 'WARNING': return 'bg-yellow-500'
    case 'HEALTHY': return 'bg-emerald-500'
    default: return 'bg-slate-400'
  }
}

function healthBg(health: string): string {
  switch (health) {
    case 'CRITICAL': return 'border-red-200 bg-red-50'
    case 'WARNING': return 'border-yellow-200 bg-yellow-50'
    default: return 'border-slate-200 bg-white'
  }
}

export default async function CommandCenter() {
  // Fetch all data in parallel
  const [clientsResult, meetingsResult, pendingResult, alertsResult, syncErrorsResult] = await Promise.all([
    supabaseAdmin.from('v_client_dashboard').select('*').order('total_emails_sent', { ascending: false }),
    supabaseAdmin.from('meetings').select('id, booking_status, client_id').gte('start_time', new Date(Date.now() - 7 * 86400000).toISOString()),
    supabaseAdmin.from('meetings').select('id').is('review_status', null).not('booking_status', 'eq', 'cancelled'),
    supabaseAdmin.from('agent_memory').select('*').order('created_at', { ascending: false }).limit(10),
    supabaseAdmin.from('sync_log').select('*').gt('records_failed', 0).order('completed_at', { ascending: false }).limit(5),
  ])

  const clients: ClientRow[] = clientsResult.data || []
  const recentMeetings = meetingsResult.data || []
  const pendingReviews = pendingResult.data || []
  const alerts: AlertRow[] = alertsResult.data || []
  const syncErrors: SyncLogRow[] = syncErrorsResult.data || []

  // Aggregate quick stats
  const totalSent = clients.reduce((sum, c) => sum + (c.total_emails_sent || 0), 0)
  const totalReplies = clients.reduce((sum, c) => sum + (c.total_replies || 0), 0)
  const totalMeetings30d = clients.reduce((sum, c) => sum + (c.meetings_30d || 0), 0)
  const avgReplyRate = totalSent > 0 ? (totalReplies / totalSent * 100) : 0

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Command Center</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {clients.length} active clients &middot; {clients.reduce((s, c) => s + (c.active_campaigns || 0), 0)} campaigns running
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
        <StatCard label="Meetings (30d)" value={totalMeetings30d.toString()} sub={`${clients.reduce((s, c) => s + (c.qualified_30d || 0), 0)} qualified`} />
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
            No active clients found. Check if <code className="rounded bg-slate-100 px-1">v_client_dashboard</code> view is accessible.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clients.map((client) => (
              <ClientCard key={client.id} client={client} />
            ))}
          </div>
        )}
      </div>

      {/* Alerts & Errors */}
      {(alerts.length > 0 || syncErrors.length > 0) && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Recent Alerts</h2>
          <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
            {syncErrors.map((err) => (
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
            {alerts.map((alert) => (
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
            {alerts.length === 0 && syncErrors.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-slate-500">
                No recent alerts
              </div>
            )}
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

function ClientCard({ client }: { client: ClientRow }) {
  return (
    <Link
      href={`/clients/${client.client_code}`}
      className={`block rounded-xl border p-4 transition-shadow hover:shadow-md ${healthBg(client.overall_health)}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${healthColor(client.overall_health)}`} />
          <span className="font-mono text-xs font-semibold text-slate-500">{client.client_code}</span>
        </div>
        <span className="text-xs text-slate-400">
          {client.active_campaigns} campaign{client.active_campaigns !== 1 ? 's' : ''}
        </span>
      </div>
      <h3 className="mt-1.5 text-sm font-semibold text-slate-900 truncate">{client.name}</h3>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-slate-500">Sent</p>
          <p className="text-sm font-semibold text-slate-800">{formatNumber(client.total_emails_sent || 0)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Reply %</p>
          <p className={`text-sm font-semibold ${
            (client.reply_rate || 0) >= 2 ? 'text-emerald-600' :
            (client.reply_rate || 0) >= 1 ? 'text-slate-800' : 'text-red-600'
          }`}>
            {(client.reply_rate || 0).toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Meetings</p>
          <p className="text-sm font-semibold text-slate-800">{client.meetings_30d || 0}</p>
        </div>
      </div>

      {/* Health warnings */}
      {(client.critical_count > 0 || client.warning_count > 0) && (
        <div className="mt-2 flex gap-2">
          {client.critical_count > 0 && (
            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              {client.critical_count} critical
            </span>
          )}
          {client.warning_count > 0 && (
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
              {client.warning_count} warning
            </span>
          )}
        </div>
      )}

      {/* Infrastructure mini-stat */}
      <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
        <span>{client.email_account_count || 0} accounts</span>
        <span>{client.domain_count || 0} domains</span>
        {client.connected_accounts !== undefined && client.email_account_count > 0 && (
          <span className={
            client.connected_accounts < client.email_account_count ? 'text-amber-500' : ''
          }>
            {client.connected_accounts}/{client.email_account_count} connected
          </span>
        )}
      </div>
    </Link>
  )
}

// ── Helpers ──

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
