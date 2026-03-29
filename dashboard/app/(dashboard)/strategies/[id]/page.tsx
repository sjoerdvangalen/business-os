import { supabaseAdmin } from '@/lib/supabase/admin'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

function statusBadge(status: string) {
  switch (status?.toLowerCase()) {
    case 'active':    return 'bg-emerald-50 text-emerald-700'
    case 'approved':  return 'bg-blue-50 text-blue-700'
    case 'review':    return 'bg-yellow-50 text-yellow-700'
    case 'archived':  return 'bg-slate-100 text-slate-600'
    case 'draft':     return 'bg-slate-50 text-slate-500'
    default:          return 'bg-slate-50 text-slate-400'
  }
}

function campaignStatusBadge(status: string) {
  switch (status?.toUpperCase()) {
    case 'ACTIVE':    return 'bg-emerald-50 text-emerald-700'
    case 'PAUSED':    return 'bg-yellow-50 text-yellow-700'
    case 'DRAFT':     return 'bg-blue-50 text-blue-600'
    case 'COMPLETED': return 'bg-slate-100 text-slate-600'
    case 'ARCHIVED':  return 'bg-slate-50 text-slate-400'
    default:          return 'bg-slate-50 text-slate-400'
  }
}

function healthBadge(status: string) {
  switch (status?.toUpperCase()) {
    case 'CRITICAL': return 'bg-red-100 text-red-700'
    case 'WARNING':  return 'bg-yellow-100 text-yellow-700'
    case 'HEALTHY':  return 'bg-emerald-100 text-emerald-700'
    default:         return 'bg-slate-100 text-slate-500'
  }
}

function fmtNum(val: number | null | undefined) {
  if (val == null) return '—'
  return val.toLocaleString('nl-NL')
}

function fmtPct(val: number | null) {
  if (val == null) return '—'
  return val.toFixed(1) + '%'
}

export default async function StrategyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: strategy } = await supabaseAdmin
    .from('gtm_strategies')
    .select('*, clients(client_code, name)')
    .eq('id', id)
    .single()

  if (!strategy) notFound()

  const client = strategy.clients as unknown as { client_code: string; name: string } | null

  const { data: campaigns } = await supabaseAdmin
    .from('campaigns')
    .select('id, name, status, health_status, emails_sent, reply_rate, positive_rate, total_leads, leads_contacted')
    .eq('strategy_id', id)
    .order('name')

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <Link href="/strategies" className="hover:text-blue-600">Strategies</Link>
            <span>/</span>
            <span className="font-mono font-semibold">{client?.client_code || '—'}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{strategy.title || strategy.code}</h1>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusBadge(strategy.status)}`}>
              {strategy.status ? strategy.status.charAt(0).toUpperCase() + strategy.status.slice(1).toLowerCase() : '—'}
            </span>
            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
              v{strategy.version}
            </span>
            {client?.name && (
              <span className="text-xs text-slate-400">
                {client.name}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {strategy.doc1_url && (
            <a
              href={strategy.doc1_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Strategy doc ↗
            </a>
          )}
          {strategy.doc2_url && (
            <a
              href={strategy.doc2_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Sheet ↗
            </a>
          )}
        </div>
      </div>

      {/* Objectives & Context */}
      {(strategy.objectives || strategy.context) && (
        <div className="grid gap-4 md:grid-cols-2">
          {strategy.objectives && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">Objectives</h2>
              <p className="whitespace-pre-wrap text-sm text-slate-600">{strategy.objectives}</p>
            </div>
          )}
          {strategy.context && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">Context</h2>
              <p className="whitespace-pre-wrap text-sm text-slate-600">{strategy.context}</p>
            </div>
          )}
        </div>
      )}

      {/* Linked campaigns */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">
            Linked Campaigns {campaigns ? `(${campaigns.length})` : ''}
          </h2>
        </div>
        {campaigns && campaigns.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-2.5">Campaign</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Health</th>
                <th className="px-4 py-2.5 text-right">Leads</th>
                <th className="px-4 py-2.5 text-right">Sent</th>
                <th className="px-4 py-2.5 text-right">Reply</th>
                <th className="px-4 py-2.5 text-right">+Reply</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campaigns.map((c) => {
                const contactedPct = c.total_leads
                  ? Math.round((c.leads_contacted / c.total_leads) * 100)
                  : 0
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-800 font-medium max-w-xs truncate">
                      {c.name}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${campaignStatusBadge(c.status)}`}>
                        {c.status ? c.status.charAt(0) + c.status.slice(1).toLowerCase() : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${healthBadge(c.health_status)}`}>
                        {c.health_status || 'UNKNOWN'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">
                      {fmtNum(c.leads_contacted)}/{fmtNum(c.total_leads)}
                      {c.total_leads > 0 && (
                        <span className="ml-1 text-xs text-slate-400">({contactedPct}%)</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{fmtNum(c.emails_sent)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{fmtPct(c.reply_rate)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={c.positive_rate && c.positive_rate > 0 ? 'text-emerald-600 font-medium' : 'text-slate-400'}>
                        {fmtPct(c.positive_rate)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={`/campaigns/${c.id}`}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
                      >
                        Details →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className="px-4 py-8 text-center text-sm text-slate-400">
            No campaigns linked to this strategy yet.
            <p className="mt-1 text-xs text-slate-400">
              Assign a campaign to this strategy from the database to see it here.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
