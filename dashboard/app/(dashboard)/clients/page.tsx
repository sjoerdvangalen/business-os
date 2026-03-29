import { supabaseAdmin } from '@/lib/supabase/admin'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function ClientsPage() {
  const { data: clients } = await supabaseAdmin
    .from('clients')
    .select('id, client_code, name, onboarding_status, report_frequency, slack_channel_id')
    .order('name')

  const rows = clients || []

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
        <p className="mt-0.5 text-sm text-slate-500">{rows.length} clients total</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left font-medium text-slate-500">Code</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Name</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Reports</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Slack</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((client) => (
              <tr key={client.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-500">
                  {client.client_code}
                </td>
                <td className="px-4 py-3 font-medium text-slate-900">{client.name}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {client.onboarding_status || '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{client.report_frequency || '—'}</td>
                <td className="px-4 py-3 text-slate-500">
                  {client.slack_channel_id ? (
                    <span className="text-emerald-600">Connected</span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/clients/${client.client_code}`}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
