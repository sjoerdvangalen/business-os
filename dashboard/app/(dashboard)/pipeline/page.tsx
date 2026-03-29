import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const STAGE_ORDER = ['new', 'contacted', 'replied', 'interested', 'meeting_booked', 'not_interested', 'blocklisted']
const STAGE_COLORS: Record<string, string> = {
  new: 'bg-slate-100 text-slate-600',
  contacted: 'bg-blue-100 text-blue-700',
  replied: 'bg-indigo-100 text-indigo-700',
  interested: 'bg-emerald-100 text-emerald-700',
  meeting_booked: 'bg-purple-100 text-purple-700',
  not_interested: 'bg-slate-100 text-slate-400',
  blocklisted: 'bg-red-100 text-red-600',
}

export default async function PipelinePage() {
  const { data: stageCounts } = await supabaseAdmin
    .from('leads')
    .select('lead_status')

  const counts: Record<string, number> = {}
  for (const row of stageCounts || []) {
    const s = row.lead_status || 'new'
    counts[s] = (counts[s] || 0) + 1
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  const { data: recentLeads } = await supabaseAdmin
    .from('leads')
    .select('id, first_name, last_name, company_name, lead_status, reply_classification, created_at, clients(client_code)')
    .in('lead_status', ['interested', 'meeting_booked'])
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pipeline</h1>
        <p className="mt-0.5 text-sm text-slate-500">{total.toLocaleString()} leads total</p>
      </div>

      {/* Funnel */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {STAGE_ORDER.map((stage) => (
          <div key={stage} className="rounded-xl border border-slate-200 bg-white p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{(counts[stage] || 0).toLocaleString()}</p>
            <p className="mt-1 text-xs text-slate-500 capitalize">{stage.replace('_', ' ')}</p>
            {total > 0 && (
              <p className="mt-0.5 text-xs text-slate-400">
                {((counts[stage] || 0) / total * 100).toFixed(1)}%
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Hot leads */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
          Hot Leads (interested + booked)
        </h2>
        {(recentLeads || []).length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            No hot leads right now
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Lead</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Company</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Client</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Classification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(recentLeads || []).map((lead) => {
                  const client = lead.clients as unknown as { client_code: string } | null
                  const color = STAGE_COLORS[lead.lead_status] || STAGE_COLORS.new
                  return (
                    <tr key={lead.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-900">
                        {lead.first_name} {lead.last_name}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{lead.company_name || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-500">
                        {client?.client_code || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
                          {lead.lead_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {lead.reply_classification || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
