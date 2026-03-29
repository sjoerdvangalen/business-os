import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export default async function InfrastructurePage() {
  const [inboxesResult, domainsResult] = await Promise.all([
    supabaseAdmin
      .from('email_inboxes')
      .select('id, email_address, status, warmup_status, daily_limit, clients(client_code)')
      .order('email_address'),
    supabaseAdmin
      .from('domains')
      .select('id, domain, spf_status, dkim_status, dmarc_status, clients(client_code)')
      .order('domain'),
  ])

  const inboxes = inboxesResult.data || []
  const domains = domainsResult.data || []

  const connected = inboxes.filter((i) => i.status === 'connected').length
  const errors = inboxes.filter((i) => i.status === 'error').length

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Infrastructure</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {inboxes.length} inboxes &middot; {connected} connected &middot; {errors > 0 ? `${errors} errors` : 'no errors'}
        </p>
      </div>

      {/* Domains */}
      {domains.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Domains</h2>
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Domain</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Client</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">SPF</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">DKIM</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">DMARC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {domains.map((domain) => {
                  const client = domain.clients as unknown as { client_code: string } | null
                  return (
                    <tr key={domain.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-900">{domain.domain}</td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-500">
                        {client?.client_code || '—'}
                      </td>
                      {[domain.spf_status, domain.dkim_status, domain.dmarc_status].map((status, i) => (
                        <td key={i} className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            status === 'pass' ? 'bg-emerald-100 text-emerald-700' :
                            status === 'fail' ? 'bg-red-100 text-red-700' :
                            'bg-slate-100 text-slate-500'
                          }`}>
                            {status || '—'}
                          </span>
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inboxes */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
          Inboxes ({inboxes.length})
        </h2>
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left font-medium text-slate-500">Email</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Client</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Warmup</th>
                <th className="px-4 py-3 text-right font-medium text-slate-500">Daily Limit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inboxes.map((inbox) => {
                const client = inbox.clients as unknown as { client_code: string } | null
                return (
                  <tr key={inbox.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-900">{inbox.email_address}</td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-500">
                      {client?.client_code || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        inbox.status === 'connected' ? 'bg-emerald-100 text-emerald-700' :
                        inbox.status === 'error' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {inbox.status || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{inbox.warmup_status || '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{inbox.daily_limit ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
