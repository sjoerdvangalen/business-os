import { supabaseAdmin } from '@/lib/supabase/admin'
import Link from 'next/link'
import FilterBar from './FilterBar'

export const dynamic = 'force-dynamic'

const CLIENTS = ['AXIS','BETS','DIGT','DOMS','FRTC','GTMS','INPE','LDEM','NEBE','NELA','OGNO','PESC','PROL','QULF','REMR','SECX']
const STATUSES = ['ACTIVE','PAUSED','DRAFT','COMPLETED','ARCHIVED']
const HEALTH = ['HEALTHY','WARNING','CRITICAL','UNKNOWN']

function healthBadge(status: string) {
  switch (status?.toUpperCase()) {
    case 'CRITICAL': return 'bg-red-100 text-red-700'
    case 'WARNING':  return 'bg-yellow-100 text-yellow-700'
    case 'HEALTHY':  return 'bg-emerald-100 text-emerald-700'
    default:         return 'bg-slate-100 text-slate-500'
  }
}

function statusBadge(status: string) {
  switch (status?.toUpperCase()) {
    case 'ACTIVE':    return 'bg-emerald-50 text-emerald-700'
    case 'PAUSED':    return 'bg-yellow-50 text-yellow-700'
    case 'DRAFT':     return 'bg-blue-50 text-blue-600'
    case 'COMPLETED': return 'bg-slate-100 text-slate-600'
    case 'ARCHIVED':  return 'bg-slate-50 text-slate-400'
    default:          return 'bg-slate-50 text-slate-400'
  }
}

function fmtPct(val: number | null) {
  if (val == null) return '—'
  return val.toFixed(1) + '%'
}

function fmtNum(val: number | null | undefined) {
  if (val == null) return '—'
  return val.toLocaleString('nl-NL')
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; status?: string; health?: string }>
}) {
  const { client: clientFilter, status: statusFilter, health: healthFilter } = await searchParams

  let query = supabaseAdmin
    .from('campaigns')
    .select('id, name, status, health_status, client_id, emails_sent, open_rate, reply_rate, positive_rate, bounce_rate, total_leads, leads_contacted, clients(client_code, name)')
    .order('name')

  if (statusFilter) query = query.ilike('status', statusFilter)
  if (healthFilter) query = query.ilike('health_status', healthFilter)

  const { data: campaigns } = await query
  let rows = campaigns || []

  if (clientFilter) {
    rows = rows.filter((c) => {
      const cl = c.clients as unknown as { client_code: string } | null
      return cl?.client_code === clientFilter
    })
  }

  const active  = rows.filter((c) => c.status?.toUpperCase() === 'ACTIVE').length
  const paused  = rows.filter((c) => c.status?.toUpperCase() === 'PAUSED').length
  const crits   = rows.filter((c) => c.health_status?.toUpperCase() === 'CRITICAL').length

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Campaigns</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {rows.length} shown &middot; {active} active &middot; {paused} paused
            {crits > 0 && <span className="ml-2 font-semibold text-red-600">{crits} critical</span>}
          </p>
        </div>
      </div>

      {/* Filters */}
      <FilterBar />

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Campaign</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Health</th>
              <th className="px-4 py-3 text-right">Leads</th>
              <th className="px-4 py-3 text-right">Sent</th>
              <th className="px-4 py-3 text-right">Reply</th>
              <th className="px-4 py-3 text-right">+Reply</th>
              <th className="px-4 py-3 text-right">Bounce</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-sm text-slate-400">
                  No campaigns match the selected filters.
                </td>
              </tr>
            )}
            {rows.map((campaign) => {
              const cl = campaign.clients as unknown as { client_code: string; name: string } | null
              const contactedPct = campaign.total_leads
                ? Math.round((campaign.leads_contacted / campaign.total_leads) * 100)
                : 0
              return (
                <tr key={campaign.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-slate-500">
                      {cl?.client_code || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <Link
                      href={`/campaigns/${campaign.id}`}
                      className="text-slate-900 hover:text-blue-600 font-medium truncate block"
                    >
                      {campaign.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(campaign.status)}`}>
                      {campaign.status ? campaign.status.charAt(0) + campaign.status.slice(1).toLowerCase() : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${healthBadge(campaign.health_status)}`}>
                      {campaign.health_status || 'UNKNOWN'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    <span title={`${campaign.leads_contacted} / ${campaign.total_leads}`}>
                      {fmtNum(campaign.leads_contacted)}/{fmtNum(campaign.total_leads)}
                      {campaign.total_leads > 0 && (
                        <span className="ml-1 text-xs text-slate-400">({contactedPct}%)</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{fmtNum(campaign.emails_sent)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{fmtPct(campaign.reply_rate)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={campaign.positive_rate && campaign.positive_rate > 0 ? 'text-emerald-600 font-medium' : 'text-slate-400'}>
                      {fmtPct(campaign.positive_rate)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={(campaign.bounce_rate ?? 0) > 3 ? 'text-red-600 font-medium' : 'text-slate-400'}>
                      {fmtPct(campaign.bounce_rate)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/campaigns/${campaign.id}`}
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
      </div>
    </div>
  )
}
