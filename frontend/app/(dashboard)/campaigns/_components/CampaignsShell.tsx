'use client'

import { useState, useMemo, Fragment } from 'react'
import { useRealtimeTable } from '@/lib/supabase/realtime'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface Campaign {
  id: string
  name: string
  client_id: string | null
  status: string
  health_status: string | null
  reply_rate: number | null
  bounce_rate: number | null
  emails_sent: number | null
  replies: number | null
  bounces: number | null
  provider: string | null
  cell_id: string | null
  created_at: string
}

interface ClientName {
  id: string
  name: string
  client_code: string
}

interface Sequence {
  id: string
  campaign_id: string
  step_number: number
  name: string
  subject: string
  sent: number | null
  replies: number | null
  wait_time_days: number | null
  is_active: boolean | null
}

interface Cell {
  id: string
  campaign_id: string | null
  cell_code: string | null
  status: string | null
  solution_key: string | null
  icp_key: string | null
  persona_key: string | null
  campaign_archetype: string | null
  signal_tier: number | null
  hook_variant: string | null
  offer_variant: string | null
  cta_variant: string | null
}

const tabs = ['all', 'active', 'paused', 'completed', 'draft', 'archived']
const pageSizes = [100, 500, 1000]

function healthBadge(health: string | null) {
  switch (health) {
    case 'HEALTHY': return <Badge className="bg-emerald-500">Healthy</Badge>
    case 'WARNING': return <Badge className="bg-amber-500">Warning</Badge>
    case 'CRITICAL': return <Badge variant="destructive">Critical</Badge>
    default: return <Badge variant="secondary">Unknown</Badge>
  }
}

function statusBadge(status: string) {
  switch (status) {
    case 'active': return <Badge className="bg-emerald-500">Active</Badge>
    case 'paused': return <Badge variant="secondary">Paused</Badge>
    case 'completed': return <Badge className="bg-blue-500">Completed</Badge>
    case 'draft': return <Badge variant="outline">Draft</Badge>
    case 'archived': return <Badge variant="secondary">Archived</Badge>
    default: return <Badge variant="outline">{status}</Badge>
  }
}

function cellStatusBadge(status: string | null) {
  if (!status) return <span className="text-xs text-slate-400">—</span>
  switch (status) {
    case 'sourcing_pending': return <Badge variant="outline" className="text-xs">Sourcing Pending</Badge>
    case 'ready': return <Badge className="text-xs bg-emerald-500">Ready</Badge>
    case 'H1_testing': return <Badge className="text-xs bg-blue-500">H1 Testing</Badge>
    case 'H1_winner': return <Badge className="text-xs bg-emerald-600">H1 Winner</Badge>
    case 'F1_testing': return <Badge className="text-xs bg-purple-500">F1 Testing</Badge>
    case 'F1_winner': return <Badge className="text-xs bg-emerald-600">F1 Winner</Badge>
    case 'CTA1_testing': return <Badge className="text-xs bg-orange-500">CTA1 Testing</Badge>
    case 'scaling': return <Badge className="text-xs bg-green-600">Scaling</Badge>
    case 'killed': return <Badge variant="destructive" className="text-xs">Killed</Badge>
    default: return <Badge variant="outline" className="text-xs">{status.replace(/_/g, ' ')}</Badge>
  }
}

export default function CampaignsShell({
  campaigns,
  clients,
  sequences,
  cells,
}: {
  campaigns: Campaign[]
  clients: ClientName[]
  sequences: Sequence[]
  cells: Cell[]
}) {
  const liveCampaigns = useRealtimeTable(campaigns, 'campaigns')
  const liveSequences = useRealtimeTable(sequences, 'email_sequences')
  const liveCells = useRealtimeTable(cells, 'campaign_cells')

  const [activeTab, setActiveTab] = useState('all')
  const [clientFilter, setClientFilter] = useState('all')
  const [pageSize, setPageSize] = useState(100)
  const [page, setPage] = useState(1)
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null)

  const clientMap = new Map(clients.map(c => [c.id, c]))
  const sequencesByCampaign = new Map<string, Sequence[]>()
  liveSequences.forEach(seq => {
    const arr = sequencesByCampaign.get(seq.campaign_id) || []
    arr.push(seq)
    sequencesByCampaign.set(seq.campaign_id, arr)
  })
  const cellsByCampaign = new Map<string, Cell[]>()
  liveCells.forEach(cell => {
    if (cell.campaign_id) {
      const arr = cellsByCampaign.get(cell.campaign_id) || []
      arr.push(cell)
      cellsByCampaign.set(cell.campaign_id, arr)
    }
  })

  // Filter by tab
  let filtered = activeTab === 'all'
    ? liveCampaigns
    : liveCampaigns.filter(c => c.status === activeTab)

  // Filter by client
  if (clientFilter !== 'all') {
    filtered = filtered.filter(c => c.client_id === clientFilter)
  }

  const totalCount = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  const sortedClients = useMemo(() => [...clients].sort((a, b) => a.client_code.localeCompare(b.client_code)), [clients])

  const activeCount = liveCampaigns.filter(c => c.status === 'active').length
  const pausedCount = liveCampaigns.filter(c => c.status === 'paused').length
  const completedCount = liveCampaigns.filter(c => c.status === 'completed').length
  const draftCount = liveCampaigns.filter(c => c.status === 'draft').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <p className="text-slate-500">Manage your email campaigns</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{liveCampaigns.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-600">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Paused</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-600">{pausedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">{completedCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {tabs.map(tab => {
          const count = tab === 'all'
            ? liveCampaigns.length
            : liveCampaigns.filter(c => c.status === tab).length
          return (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setPage(1) }}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              <span className="ml-1.5 text-xs opacity-70">({count})</span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={clientFilter}
          onChange={e => { setClientFilter(e.target.value); setPage(1) }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="all">All clients</option>
          {sortedClients.map(c => (
            <option key={c.id} value={c.id}>{c.client_code} — {c.name}</option>
          ))}
        </select>

        <select
          value={pageSize}
          onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          {pageSizes.map(s => (
            <option key={s} value={s}>{s} / page</option>
          ))}
        </select>

        <span className="text-sm text-slate-500">
          Showing {totalCount > 0 ? (safePage - 1) * pageSize + 1 : 0}–{Math.min(safePage * pageSize, totalCount)} of {totalCount}
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Campaigns</CardTitle>
          <CardDescription>{totalCount} shown · {draftCount} drafts total</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Health</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Replies</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Provider</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map(campaign => {
                const client = campaign.client_id ? clientMap.get(campaign.client_id) : null
                const rate = campaign.emails_sent && campaign.emails_sent > 0
                  ? (((campaign.replies || 0) / campaign.emails_sent) * 100).toFixed(1)
                  : '0.0'
                const seqs = sequencesByCampaign.get(campaign.id) || []
                const cellList = cellsByCampaign.get(campaign.id) || []
                const isExpanded = expandedCampaign === campaign.id
                return (
                  <Fragment key={campaign.id}>
                    <TableRow className="cursor-pointer" onClick={() => setExpandedCampaign(isExpanded ? null : campaign.id)}>
                      <TableCell>
                        <svg className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </TableCell>
                      <TableCell className="font-medium">{campaign.name}</TableCell>
                      <TableCell>
                        {client ? <Badge variant="outline" className="font-mono text-xs">{client.client_code}</Badge> : '—'}
                      </TableCell>
                      <TableCell>{statusBadge(campaign.status)}</TableCell>
                      <TableCell>{healthBadge(campaign.health_status)}</TableCell>
                      <TableCell className="text-right">{(campaign.emails_sent || 0).toLocaleString('nl-NL')}</TableCell>
                      <TableCell className="text-right">{(campaign.replies || 0).toLocaleString('nl-NL')}</TableCell>
                      <TableCell className="text-right">{rate}%</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="text-xs capitalize">{campaign.provider || '—'}</Badge>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow className="bg-slate-50">
                        <TableCell colSpan={9} className="p-0">
                          <div className="px-4 py-4 space-y-4">
                            {seqs.length > 0 && (
                              <div>
                                <h4 className="text-sm font-semibold mb-2">Sequences ({seqs.length})</h4>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="w-12">Step</TableHead>
                                      <TableHead>Name</TableHead>
                                      <TableHead>Subject</TableHead>
                                      <TableHead className="text-right">Sent</TableHead>
                                      <TableHead className="text-right">Replies</TableHead>
                                      <TableHead className="text-right">Wait</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {seqs.sort((a, b) => a.step_number - b.step_number).map(seq => (
                                      <TableRow key={seq.id}>
                                        <TableCell className="text-xs">{seq.step_number}</TableCell>
                                        <TableCell className="text-sm truncate max-w-[200px]">{seq.name}</TableCell>
                                        <TableCell className="text-sm truncate max-w-[250px] text-muted-foreground">{seq.subject}</TableCell>
                                        <TableCell className="text-right text-sm">{(seq.sent || 0).toLocaleString('nl-NL')}</TableCell>
                                        <TableCell className="text-right text-sm">{(seq.replies || 0).toLocaleString('nl-NL')}</TableCell>
                                        <TableCell className="text-right text-sm">{seq.wait_time_days ?? '—'}d</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                            {cellList.length > 0 && (
                              <div>
                                <h4 className="text-sm font-semibold mb-2">Cells ({cellList.length})</h4>
                                <div className="flex flex-wrap gap-2">
                                  {cellList.map(cell => (
                                    <div key={cell.id} className="rounded-lg border bg-white px-3 py-2 text-xs">
                                      <div className="font-medium truncate max-w-[200px]">{cell.cell_code || cell.solution_key}</div>
                                      <div className="flex items-center gap-2 mt-1">
                                        {cellStatusBadge(cell.status)}
                                        {cell.campaign_archetype && <Badge variant="outline" className="text-[10px]">{cell.campaign_archetype}</Badge>}
                                        {cell.signal_tier && <span className="text-[10px] text-slate-400">T{cell.signal_tier}</span>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {seqs.length === 0 && cellList.length === 0 && (
                              <p className="text-sm text-slate-400">No sequences or cells linked.</p>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })}
              {paginated.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-slate-500">No campaigns found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-slate-500">
            Page {safePage} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
