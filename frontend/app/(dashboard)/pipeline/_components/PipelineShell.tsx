'use client'

import { useState, useMemo } from 'react'
import { useRealtimeTable } from '@/lib/supabase/realtime'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface PipelineClient {
  id: string
  client_code: string
  name: string
  status: string
  stage: string | null
  approval_status: string | null
  workflow_metrics: Record<string, unknown> | null
  last_intake_at: string | null
}

const tabs = ['all', 'onboarding', 'running', 'scaling', 'paused']
const pageSizes = [100, 500, 1000]

function toTitleCase(str: string): string {
  return str.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function statusBadge(status: string) {
  switch (status) {
    case 'onboarding': return <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200">Onboarding</Badge>
    case 'running': return <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200">Running</Badge>
    case 'scaling': return <Badge className="text-xs bg-green-100 text-green-700 border-green-200">Scaling</Badge>
    case 'paused': return <Badge variant="secondary" className="text-xs">Paused</Badge>
    case 'churned': return <Badge variant="destructive" className="text-xs">Churned</Badge>
    case 'offboarding': return <Badge variant="outline" className="text-xs text-slate-500">Offboarding</Badge>
    default: return <Badge variant="outline" className="text-xs">{toTitleCase(status)}</Badge>
  }
}

function stageBadge(stage: string | null) {
  if (!stage) return <span className="text-xs text-slate-400">—</span>
  const label = toTitleCase(stage)
  switch (stage) {
    case 'intake': return <Badge variant="outline" className="text-xs">{label}</Badge>
    case 'internal_approval': return <Badge className="text-xs bg-blue-500">{label}</Badge>
    case 'external_approval': return <Badge className="text-xs bg-purple-500">{label}</Badge>
    case 'messaging_approval': return <Badge className="text-xs bg-amber-500">{label}</Badge>
    case 'data_sourcing': return <Badge className="text-xs bg-orange-500">{label}</Badge>
    case 'h1': return <Badge className="text-xs bg-emerald-500">{label}</Badge>
    case 'f1': return <Badge className="text-xs bg-emerald-600">{label}</Badge>
    case 'cta1': return <Badge className="text-xs bg-green-500">{label}</Badge>
    case 'scaling': return <Badge className="text-xs bg-green-600">{label}</Badge>
    default: return <Badge variant="outline" className="text-xs">{label}</Badge>
  }
}

function approvalBadge(as: string | null) {
  if (!as) return <span className="text-xs text-slate-400">—</span>
  const label = toTitleCase(as)
  if (as.includes('approved')) return <Badge variant="secondary" className="text-xs">{label}</Badge>
  if (as.includes('rejected') || as.includes('iteration')) return <Badge variant="destructive" className="text-xs">{label}</Badge>
  if (as === 'external_sent' || as === 'internal_review') return <Badge className="text-xs bg-blue-500">{label}</Badge>
  return <Badge variant="outline" className="text-xs">{label}</Badge>
}

function infraBadge(wm: Record<string, unknown> | null) {
  const infra = wm?.infra as Record<string, unknown> | undefined
  const status = infra?.status as string | undefined
  if (!status || status === '-') return <span className="text-xs text-slate-400">—</span>
  if (status === 'ready') return <Badge className="text-xs bg-emerald-500">ready</Badge>
  return <Badge variant="outline" className="text-xs">{status}</Badge>
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: '2-digit' })
}

export default function PipelineShell({ clients }: { clients: PipelineClient[] }) {
  const liveClients = useRealtimeTable(clients, 'clients')

  const [activeTab, setActiveTab] = useState('all')
  const [pageSize, setPageSize] = useState(100)
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    let list = [...liveClients]
    if (activeTab !== 'all') {
      list = list.filter(c => c.status === activeTab)
    }
    return list
  }, [liveClients, activeTab])

  const totalCount = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pipeline</h1>
        <p className="text-slate-500">GTM onboarding status per client</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {tabs.map(tab => {
          const count = tab === 'all'
            ? clients.length
            : clients.filter(c => c.status === tab).length
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
          <CardTitle>Clients ({totalCount})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Approval</TableHead>
                <TableHead>Infra</TableHead>
                <TableHead className="text-right">Intake</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map(client => (
                <TableRow key={client.id}>
                  <TableCell className="font-mono text-xs font-medium">{client.client_code}</TableCell>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell>{statusBadge(client.status)}</TableCell>
                  <TableCell>{stageBadge(client.stage)}</TableCell>
                  <TableCell>{approvalBadge(client.approval_status)}</TableCell>
                  <TableCell>{infraBadge(client.workflow_metrics)}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {formatDate(client.last_intake_at)}
                  </TableCell>
                </TableRow>
              ))}
              {paginated.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-slate-500">No active clients found</TableCell>
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
