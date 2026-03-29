import { supabaseAdmin } from '@/lib/supabase/admin'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

const TABS = ['overview', 'campaigns', 'infrastructure', 'leads', 'meetings', 'activity'] as const
type Tab = typeof TABS[number]

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export default async function ClientWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { code } = await params
  const { tab: rawTab } = await searchParams
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? '') ? (rawTab as Tab) : 'overview'

  const { data: client } = await supabaseAdmin
    .from('clients')
    .select('*')
    .eq('client_code', code.toUpperCase())
    .single()

  if (!client) notFound()

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/clients" className="text-sm text-slate-400 hover:text-slate-600">
          ← Clients
        </Link>
        <span className="text-slate-300">/</span>
        <div>
          <span className="font-mono text-sm font-semibold text-slate-500">{client.client_code}</span>
          <span className="ml-2 text-xl font-bold text-slate-900">{client.name}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/clients/${code}?tab=${t}`}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t}
          </Link>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && <ClientOverview client={client} />}
      {tab === 'campaigns' && <ClientCampaigns clientId={client.id} />}
      {tab === 'infrastructure' && <ClientInfrastructure clientId={client.id} />}
      {tab === 'leads' && <ClientLeads clientId={client.id} />}
      {tab === 'meetings' && <ClientMeetings clientId={client.id} />}
      {tab === 'activity' && <ClientActivity clientId={client.id} />}
    </div>
  )
}

async function ClientOverview({ client }: { client: Record<string, unknown> }) {
  const clientId = client.id as string

  const [campaignsResult, inboxesResult, leadsResult, meetingsResult] = await Promise.all([
    supabaseAdmin.from('campaigns').select('id, status').eq('client_id', clientId),
    supabaseAdmin.from('email_inboxes').select('id, status').eq('client_id', clientId),
    supabaseAdmin.from('leads').select('id, lead_status').eq('client_id', clientId),
    supabaseAdmin
      .from('meetings')
      .select('id, booking_status')
      .eq('client_id', clientId)
      .gte('start_time', new Date(Date.now() - 30 * 86400000).toISOString()),
  ])

  const campaigns = campaignsResult.data || []
  const inboxes = inboxesResult.data || []
  const leads = leadsResult.data || []
  const meetings = meetingsResult.data || []

  const activeCampaigns = campaigns.filter((c) => c.status === 'active').length
  const connectedInboxes = inboxes.filter((i) => i.status === 'connected').length
  const hotLeads = leads.filter((l) => ['interested', 'meeting_booked'].includes(l.lead_status)).length
  const meetingsBooked = meetings.filter((m) => m.booking_status !== 'cancelled').length
  const qualified = meetings.filter((m) => m.booking_status === 'qualified').length

  const stats = [
    { label: 'Active Campaigns', value: activeCampaigns.toString(), sub: `${campaigns.length} total` },
    { label: 'Inboxes', value: `${connectedInboxes}/${inboxes.length}`, sub: 'connected' },
    { label: 'Hot Leads', value: formatNumber(hotLeads), sub: `${formatNumber(leads.length)} total` },
    { label: 'Meetings (30d)', value: meetingsBooked.toString(), sub: `${qualified} qualified` },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{s.value}</p>
            <p className="mt-0.5 text-xs text-slate-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Client details */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-slate-900">Client Details</h3>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          {[
            ['Status', client.onboarding_status as string],
            ['Reports', client.report_frequency as string],
            ['Slack', client.slack_channel_id ? 'Connected' : 'Not set'],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="mt-0.5 font-medium text-slate-900">{value || '—'}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

async function ClientCampaigns({ clientId }: { clientId: string }) {
  const { data: campaigns } = await supabaseAdmin
    .from('campaigns')
    .select('id, name, status, health_status')
    .eq('client_id', clientId)
    .order('name')

  const rows = campaigns || []

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-4 py-3 text-left font-medium text-slate-500">Campaign</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Health</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((c) => (
            <tr key={c.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-900">{c.name}</td>
              <td className="px-4 py-3 capitalize text-slate-500">{c.status || '—'}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                  c.health_status === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                  c.health_status === 'WARNING' ? 'bg-yellow-100 text-yellow-700' :
                  c.health_status === 'HEALTHY' ? 'bg-emerald-100 text-emerald-700' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {c.health_status || 'UNKNOWN'}
                </span>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-500">No campaigns</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

async function ClientInfrastructure({ clientId }: { clientId: string }) {
  const { data: inboxes } = await supabaseAdmin
    .from('email_inboxes')
    .select('id, email_address, status, warmup_status, daily_limit')
    .eq('client_id', clientId)
    .order('email_address')

  const rows = inboxes || []

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-4 py-3 text-left font-medium text-slate-500">Email</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Warmup</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Daily Limit</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((inbox) => (
            <tr key={inbox.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-900">{inbox.email_address}</td>
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
              <td className="px-4 py-3 text-slate-500">{inbox.daily_limit ?? '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">No inboxes</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

async function ClientLeads({ clientId }: { clientId: string }) {
  const { data: leads } = await supabaseAdmin
    .from('leads')
    .select('id, first_name, last_name, company_name, lead_status, reply_classification, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(50)

  const rows = leads || []

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-4 py-3 text-left font-medium text-slate-500">Lead</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Company</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Classification</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((lead) => (
            <tr key={lead.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-900">
                {lead.first_name} {lead.last_name}
              </td>
              <td className="px-4 py-3 text-slate-500">{lead.company_name || '—'}</td>
              <td className="px-4 py-3 text-xs text-slate-500 capitalize">
                {lead.lead_status?.replace('_', ' ') || '—'}
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">{lead.reply_classification || '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">No leads</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

async function ClientMeetings({ clientId }: { clientId: string }) {
  const { data: meetings } = await supabaseAdmin
    .from('meetings')
    .select('id, booking_status, start_time, attendee_name, attendee_email, review_status')
    .eq('client_id', clientId)
    .order('start_time', { ascending: false })
    .limit(30)

  const rows = meetings || []

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-4 py-3 text-left font-medium text-slate-500">Date</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Attendee</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Review</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((meeting) => (
            <tr key={meeting.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                {meeting.start_time
                  ? new Date(meeting.start_time).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
                  : '—'}
              </td>
              <td className="px-4 py-3 text-slate-900">{meeting.attendee_name || meeting.attendee_email || '—'}</td>
              <td className="px-4 py-3 text-xs text-slate-500">{meeting.booking_status}</td>
              <td className="px-4 py-3 text-xs text-slate-500">{meeting.review_status || '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">No meetings</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

async function ClientActivity({ clientId }: { clientId: string }) {
  const { data: events } = await supabaseAdmin
    .from('events')
    .select('id, event_type, occurred_at, metadata')
    .eq('client_id', clientId)
    .order('occurred_at', { ascending: false })
    .limit(50)

  const rows = events || []

  return (
    <div className="space-y-1">
      {rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No activity yet
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          {rows.map((event) => (
            <div key={event.id} className="flex items-center gap-3 px-4 py-3">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-slate-700">{event.event_type}</span>
              </div>
              <span className="text-xs text-slate-400 whitespace-nowrap">
                {new Date(event.occurred_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
