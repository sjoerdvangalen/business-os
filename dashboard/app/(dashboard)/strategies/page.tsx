import { supabaseAdmin } from '@/lib/supabase/admin'
import Link from 'next/link'

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

export default async function StrategiesPage() {
  const { data: strategies } = await supabaseAdmin
    .from('gtm_strategies')
    .select('id, code, title, status, version, doc1_url, client_id, clients(client_code, name)')
    .order('created_at', { ascending: false })

  const rows = strategies || []

  // Group by client
  const byClient = new Map<string, typeof rows>()
  for (const s of rows) {
    const client = s.clients as unknown as { client_code: string; name: string } | null
    const key = client?.client_code || 'UNKNOWN'
    if (!byClient.has(key)) byClient.set(key, [])
    byClient.get(key)!.push(s)
  }

  const sortedClients = Array.from(byClient.entries()).sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Strategies</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {rows.length} strategies across {sortedClients.length} clients
          </p>
        </div>
      </div>

      {sortedClients.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          No strategies found yet. Create one to get started.
        </div>
      )}

      <div className="space-y-3">
        {sortedClients.map(([clientCode, clientStrategies]) => {
          const clientName = (clientStrategies[0].clients as unknown as { name: string } | null)?.name
          return (
            <details key={clientCode} className="group rounded-xl border border-slate-200 bg-white" open>
              <summary className="flex cursor-pointer items-center justify-between px-4 py-3 hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-semibold text-slate-500">{clientCode}</span>
                  <span className="text-sm font-medium text-slate-700">{clientName}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    {clientStrategies.length} strategies
                  </span>
                </div>
                <span className="text-xs text-slate-400 transition group-open:rotate-180">▼</span>
              </summary>
              <div className="border-t border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                      <th className="px-4 py-2.5">Code</th>
                      <th className="px-4 py-2.5">Title</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Version</th>
                      <th className="px-4 py-2.5">Document</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {clientStrategies.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{s.code}</td>
                        <td className="px-4 py-2.5 text-slate-800 font-medium">
                          {s.title || '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(s.status)}`}>
                            {s.status ? s.status.charAt(0).toUpperCase() + s.status.slice(1).toLowerCase() : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-600">v{s.version}</td>
                        <td className="px-4 py-2.5">
                          {s.doc1_url ? (
                            <a
                              href={s.doc1_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-medium text-blue-600 hover:text-blue-700"
                            >
                              Open doc ↗
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Link
                            href={`/strategies/${s.id}`}
                            className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
                          >
                            Details →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )
        })}
      </div>
    </div>
  )
}
