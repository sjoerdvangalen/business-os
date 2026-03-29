import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  warning: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  info: 'bg-blue-100 text-blue-700 border-blue-200',
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default async function AlertsPage() {
  const [openResult, resolvedResult] = await Promise.all([
    supabaseAdmin
      .from('alerts')
      .select('id, severity, alert_type, message, created_at, client_id, clients(client_code, name)')
      .is('resolved_at', null)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('alerts')
      .select('id, severity, alert_type, message, created_at, resolved_at, client_id, clients(client_code, name)')
      .not('resolved_at', 'is', null)
      .order('resolved_at', { ascending: false })
      .limit(20),
  ])

  const open = openResult.data || []
  const resolved = resolvedResult.data || []

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Alerts</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {open.length} open &middot; {open.filter((a) => a.severity === 'critical').length} critical
        </p>
      </div>

      {open.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <p className="text-sm font-medium text-emerald-700">All clear — no open alerts</p>
        </div>
      ) : (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Open</h2>
          {open.map((alert) => {
            const client = alert.clients as unknown as { client_code: string } | null
            const color = SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.info
            return (
              <div
                key={alert.id}
                className={`flex items-start gap-3 rounded-xl border p-4 ${color}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide">{alert.severity}</span>
                    <span className="text-xs opacity-75">{alert.alert_type}</span>
                    {client?.client_code && (
                      <span className="font-mono text-xs font-semibold">{client.client_code}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm">{alert.message}</p>
                </div>
                <span className="shrink-0 text-xs opacity-60">{timeAgo(alert.created_at)}</span>
              </div>
            )
          })}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Recently Resolved</h2>
          {resolved.map((alert) => {
            const client = alert.clients as unknown as { client_code: string } | null
            return (
              <div key={alert.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 opacity-60">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{alert.severity}</span>
                    <span className="text-xs text-slate-400">{alert.alert_type}</span>
                    {client?.client_code && (
                      <span className="font-mono text-xs font-semibold text-slate-400">{client.client_code}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">{alert.message}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-400">{timeAgo(alert.created_at)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
