import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export default async function ClientReportPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params

  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verify access — client_viewer can only see their own client
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('role, client_id')
    .eq('id', user.id)
    .single()

  const { data: client } = await supabaseAdmin
    .from('clients')
    .select('id, client_code, name')
    .eq('client_code', code.toUpperCase())
    .single()

  if (!client) notFound()

  // client_viewer may only see their assigned client
  if (profile?.role === 'client_viewer' && profile.client_id !== client.id) {
    redirect(`/report/${profile.client_id}`)
  }

  // Fetch client data
  const [campaignsResult, meetingsResult, snapshotsResult] = await Promise.all([
    supabaseAdmin
      .from('campaigns')
      .select('id, name, status, health_status')
      .eq('client_id', client.id)
      .eq('status', 'active'),
    supabaseAdmin
      .from('meetings')
      .select('id, booking_status, start_time, attendee_name')
      .eq('client_id', client.id)
      .gte('start_time', new Date(Date.now() - 30 * 86400000).toISOString())
      .order('start_time', { ascending: false }),
    supabaseAdmin
      .from('daily_snapshots')
      .select('date, emails_sent, replies, positive_replies, meetings_booked, meetings_qualified, reply_rate')
      .eq('client_id', client.id)
      .order('date', { ascending: false })
      .limit(30),
  ])

  const campaigns = campaignsResult.data || []
  const meetings = meetingsResult.data || []
  const snapshots = snapshotsResult.data || []

  const totalEmails = snapshots.reduce((s, d) => s + (d.emails_sent || 0), 0)
  const totalReplies = snapshots.reduce((s, d) => s + (d.replies || 0), 0)
  const totalMeetings = meetings.filter((m) => m.booking_status !== 'cancelled').length
  const qualified = meetings.filter((m) => m.booking_status === 'qualified').length
  const avgReplyRate = totalEmails > 0 ? (totalReplies / totalEmails * 100) : 0

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">VGG Acquisition</p>
            <h1 className="text-xl font-bold text-slate-900">{client.name}</h1>
          </div>
          <p className="text-sm text-slate-500">
            {new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 p-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Emails Sent (30d)', value: formatNumber(totalEmails) },
            { label: 'Reply Rate', value: `${avgReplyRate.toFixed(1)}%` },
            { label: 'Meetings Booked', value: totalMeetings.toString() },
            { label: 'Qualified', value: qualified.toString() },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4 text-center">
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="mt-0.5 text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Active Campaigns */}
        {campaigns.length > 0 && (
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Active Campaigns
            </h2>
            <div className="space-y-2">
              {campaigns.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <span className="text-sm text-slate-900">{c.name}</span>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    c.health_status === 'HEALTHY' ? 'bg-emerald-100 text-emerald-700' :
                    c.health_status === 'WARNING' ? 'bg-yellow-100 text-yellow-700' :
                    c.health_status === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {c.health_status || 'UNKNOWN'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Meetings */}
        {meetings.length > 0 && (
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Recent Meetings
            </h2>
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-left font-medium text-slate-500">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">Attendee</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {meetings.slice(0, 10).map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-3 text-slate-500">
                        {m.start_time
                          ? new Date(m.start_time).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-900">{m.attendee_name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          m.booking_status === 'qualified' ? 'bg-purple-100 text-purple-700' :
                          m.booking_status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                          m.booking_status === 'no_show' ? 'bg-red-100 text-red-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {m.booking_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Daily Trend (last 7 days) */}
        {snapshots.length > 0 && (
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Daily Activity (last 7 days)
            </h2>
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-left font-medium text-slate-500">Date</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500">Sent</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500">Replies</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500">Reply %</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500">Meetings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {snapshots.slice(0, 7).map((s) => (
                    <tr key={s.date} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-500">{s.date}</td>
                      <td className="px-4 py-3 text-right text-slate-900">{formatNumber(s.emails_sent)}</td>
                      <td className="px-4 py-3 text-right text-slate-900">{s.replies}</td>
                      <td className="px-4 py-3 text-right text-slate-900">
                        {s.reply_rate ? `${(Number(s.reply_rate) * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-900">{s.meetings_booked}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
