import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const STATUS_COLORS: Record<string, string> = {
  booked: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  qualified: 'bg-purple-100 text-purple-700',
  unqualified: 'bg-slate-100 text-slate-600',
  no_show: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-400',
  rescheduled: 'bg-yellow-100 text-yellow-700',
}

function formatDate(str: string) {
  return new Date(str).toLocaleString('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function MeetingsPage() {
  const { data: meetings } = await supabaseAdmin
    .from('meetings')
    .select(`
      id, booking_status, start_time, end_time,
      attendee_name, attendee_email, review_status,
      clients(client_code, name)
    `)
    .order('start_time', { ascending: false })
    .limit(100)

  const rows = meetings || []
  const pending = rows.filter((m) => !m.review_status && m.booking_status !== 'cancelled').length

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Meetings</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {rows.length} recent &middot; {pending} pending review
          </p>
        </div>
        {pending > 0 && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700">
            {pending} need review
          </span>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left font-medium text-slate-500">Date</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Client</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Attendee</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Review</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((meeting) => {
              const client = meeting.clients as unknown as { client_code: string; name: string } | null
              const color = STATUS_COLORS[meeting.booking_status] || 'bg-slate-100 text-slate-600'
              return (
                <tr key={meeting.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {meeting.start_time ? formatDate(meeting.start_time) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-slate-500">
                      {client?.client_code || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-900">
                    <div>{meeting.attendee_name || '—'}</div>
                    {meeting.attendee_email && (
                      <div className="text-xs text-slate-400">{meeting.attendee_email}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
                      {meeting.booking_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {meeting.review_status ? (
                      <span className="text-xs text-slate-500">{meeting.review_status}</span>
                    ) : meeting.booking_status !== 'cancelled' ? (
                      <span className="text-xs font-medium text-amber-600">Pending</span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
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
