import { supabaseAdmin } from '@/lib/supabase/admin'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

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
    default:          return 'bg-slate-50 text-slate-400'
  }
}

// Rates are stored as percentages (e.g. 5.0 = 5%), not 0–1 fractions
function fmtPct(val: number | null) {
  if (val == null) return '—'
  return val.toFixed(1) + '%'
}

function fmtNum(val: number | null | undefined) {
  if (val == null) return '—'
  return val.toLocaleString('nl-NL')
}

function fmtDate(val: string | null) {
  if (!val) return '—'
  return new Date(val).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color || 'text-slate-900'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  )
}

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: campaign } = await supabaseAdmin
    .from('campaigns')
    .select('*, clients(client_code, name, slack_channel_id)')
    .eq('id', id)
    .single()

  if (!campaign) notFound()

  const client = campaign.clients as unknown as { client_code: string; name: string } | null

  const { data: sequences } = await supabaseAdmin
    .from('email_sequences')
    .select('id, step_number, name, subject, wait_time_days, sent, replies, positive_replies, is_active, variation')
    .eq('campaign_id', id)
    .order('step_number')

  // Recent leads for this campaign
  const { data: recentLeads } = await supabaseAdmin
    .from('leads')
    .select('id, email, first_name, last_name, company_name, lead_status, reply_classification, last_replied_at')
    .eq('campaign_id', campaign.plusvibe_id ?? '')
    .order('last_replied_at', { ascending: false })
    .limit(20)

  const contactedPct = campaign.total_leads
    ? Math.round((campaign.leads_contacted / campaign.total_leads) * 100)
    : 0

  const monitoringNotes = campaign.monitoring_notes as unknown as { checked_at?: string; issues?: string[]; summary?: string } | null

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <Link href="/campaigns" className="hover:text-blue-600">Campaigns</Link>
            <span>/</span>
            <span className="font-mono font-semibold">{client?.client_code || '—'}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{campaign.name}</h1>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusBadge(campaign.status)}`}>
              {campaign.status ? campaign.status.charAt(0) + campaign.status.slice(1).toLowerCase() : '—'}
            </span>
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${healthBadge(campaign.health_status)}`}>
              {campaign.health_status || 'UNKNOWN'}
            </span>
            {campaign.language && (
              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                {campaign.language}
              </span>
            )}
            <span className="text-xs text-slate-400">
              Started {fmtDate(campaign.start_date)} &middot; Last sync {fmtDate(campaign.last_synced_at)}
            </span>
          </div>
        </div>
        {campaign.plusvibe_id && (
          <a
            href={`https://app.plusvibe.ai/campaigns/${campaign.plusvibe_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Open in PlusVibe ↗
          </a>
        )}
      </div>

      {/* Leads progress */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-slate-700">Lead Progress</p>
          <p className="text-sm text-slate-500">
            {fmtNum(campaign.leads_contacted)} contacted / {fmtNum(campaign.total_leads)} total ({contactedPct}%)
          </p>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-100">
          <div
            className="h-2 rounded-full bg-blue-500 transition-all"
            style={{ width: `${contactedPct}%` }}
          />
        </div>
        {campaign.last_lead_sent && (
          <p className="mt-1 text-xs text-slate-400">Last sent: {fmtDate(campaign.last_lead_sent)}</p>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Emails sent" value={fmtNum(campaign.emails_sent)} />
        <StatCard
          label="Replies"
          value={fmtNum(campaign.replies)}
          sub={fmtPct(campaign.reply_rate)}
          color="text-slate-900"
        />
        <StatCard
          label="Positive replies"
          value={fmtNum(campaign.positive_replies)}
          sub={fmtPct(campaign.positive_rate)}
          color={(campaign.positive_replies ?? 0) > 0 ? 'text-emerald-600' : 'text-slate-900'}
        />
        <StatCard
          label="Bounces"
          value={fmtNum(campaign.bounces)}
          sub={fmtPct(campaign.bounce_rate)}
          color={(campaign.bounce_rate ?? 0) > 3 ? 'text-red-600' : 'text-slate-900'}
        />
      </div>

      {/* Reply breakdown */}
      {(campaign.positive_replies || campaign.neutral_replies || campaign.negative_replies) ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Reply Breakdown</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-emerald-600">{campaign.positive_replies ?? 0}</p>
              <p className="text-xs text-slate-500 mt-0.5">Positive</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-600">{campaign.neutral_replies ?? 0}</p>
              <p className="text-xs text-slate-500 mt-0.5">Neutral</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-500">{campaign.negative_replies ?? 0}</p>
              <p className="text-xs text-slate-500 mt-0.5">Negative</p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Email sequences */}
      {sequences && sequences.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">Email Sequences ({sequences.length} steps)</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-2.5">Step</th>
                <th className="px-4 py-2.5">Subject</th>
                <th className="px-4 py-2.5">Variation</th>
                <th className="px-4 py-2.5 text-right">Delay</th>
                <th className="px-4 py-2.5 text-right">Sent</th>
                <th className="px-4 py-2.5 text-right">Replies</th>
                <th className="px-4 py-2.5 text-right">+Replies</th>
                <th className="px-4 py-2.5">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sequences.map((seq) => {
                const replyRate = seq.sent && seq.sent > 0
                  ? ((seq.replies ?? 0) / seq.sent * 100).toFixed(1) + '%'
                  : '—'
                return (
                  <tr key={seq.id} className={seq.is_active ? '' : 'opacity-50'}>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                        {seq.step_number}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-800 max-w-xs">
                      <p className="truncate font-medium">{seq.subject || seq.name || '—'}</p>
                      {seq.name && seq.subject && (
                        <p className="truncate text-xs text-slate-400">{seq.name}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{seq.variation || '—'}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">
                      {seq.wait_time_days != null ? `+${seq.wait_time_days}d` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{seq.sent ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">
                      {seq.replies ?? '—'} <span className="text-xs text-slate-400">({replyRate})</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={seq.positive_replies && seq.positive_replies > 0 ? 'text-emerald-600 font-medium' : 'text-slate-400'}>
                        {seq.positive_replies ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block h-2 w-2 rounded-full ${seq.is_active ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent replies */}
      {recentLeads && recentLeads.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">Recent Replies</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-2.5">Contact</th>
                <th className="px-4 py-2.5">Company</th>
                <th className="px-4 py-2.5">Classification</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Replied</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentLeads.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-800">
                    {lead.first_name || lead.last_name
                      ? `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim()
                      : lead.email}
                    <p className="text-xs text-slate-400">{lead.email}</p>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{lead.company_name || '—'}</td>
                  <td className="px-4 py-2.5">
                    {lead.reply_classification ? (
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        lead.reply_classification === 'MEETING_REQUEST' ? 'bg-emerald-100 text-emerald-700' :
                        lead.reply_classification === 'POSITIVE'        ? 'bg-blue-100 text-blue-700' :
                        lead.reply_classification === 'NOT_INTERESTED'  ? 'bg-red-50 text-red-500' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {lead.reply_classification.replace(/_/g, ' ')}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 capitalize">
                    {lead.lead_status?.replace(/_/g, ' ') || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-slate-400">
                    {fmtDate(lead.last_replied_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Monitoring notes */}
      {monitoringNotes && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Health Monitor Notes</h2>
          {monitoringNotes.checked_at && (
            <p className="text-xs text-slate-400 mb-2">Last checked: {fmtDate(monitoringNotes.checked_at)}</p>
          )}
          {monitoringNotes.summary && (
            <p className="text-sm text-slate-600 mb-2">{monitoringNotes.summary}</p>
          )}
          {monitoringNotes.issues && monitoringNotes.issues.length > 0 && (
            <ul className="space-y-1">
              {monitoringNotes.issues.map((issue, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                  <span className="mt-0.5 text-red-500">•</span>
                  {issue}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
