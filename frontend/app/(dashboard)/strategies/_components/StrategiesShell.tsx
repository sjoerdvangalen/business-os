'use client'

import { useState, useMemo } from 'react'
import { useRealtimeTable } from '@/lib/supabase/realtime'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import Link from 'next/link'

interface Strategy {
  id: string
  client_id: string
  version: number
  status: string
  created_at: string
  updated_at: string
}

interface ClientName {
  id: string
  name: string
  client_code: string
}

const tabs = ['all', 'draft', 'synthesized', 'internal_review', 'internal_approved', 'external_sent', 'external_iteration', 'external_approved']
const pageSizes = [100, 500, 1000]

function statusBadge(status: string) {
  switch (status) {
    case 'draft': return <Badge variant="secondary">Draft</Badge>
    case 'synthesized': return <Badge variant="secondary">Synthesized</Badge>
    case 'internal_review': return <Badge className="bg-blue-500">Internal Review</Badge>
    case 'internal_approved': return <Badge className="bg-emerald-500">Internal Approved</Badge>
    case 'external_sent': return <Badge className="bg-purple-500">External Sent</Badge>
    case 'external_iteration': return <Badge className="bg-amber-500">External Iteration</Badge>
    case 'external_approved': return <Badge className="bg-emerald-600">External Approved</Badge>
    default: return <Badge variant="outline">{status}</Badge>
  }
}

export default function StrategiesShell({
  strategies,
  clients,
}: {
  strategies: Strategy[]
  clients: ClientName[]
}) {
  const liveStrategies = useRealtimeTable(strategies, 'gtm_strategies')

  const [activeTab, setActiveTab] = useState('all')
  const [clientFilter, setClientFilter] = useState('all')
  const [pageSize, setPageSize] = useState(100)
  const [page, setPage] = useState(1)

  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients])

  const filtered = useMemo(() => {
    let list = [...liveStrategies]
    if (activeTab !== 'all') {
      list = list.filter(s => s.status === activeTab)
    }
    if (clientFilter !== 'all') {
      list = list.filter(s => s.client_id === clientFilter)
    }
    return list
  }, [liveStrategies, activeTab, clientFilter])

  const totalCount = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  const approved = liveStrategies.filter(s => s.status === 'external_approved').length
  const inReview = liveStrategies.filter(s => s.status === 'internal_review' || s.status === 'external_iteration').length
  const draft = liveStrategies.filter(s => s.status === 'draft' || s.status === 'synthesized').length

  const sortedClients = useMemo(() => [...clients].sort((a, b) => a.client_code.localeCompare(b.client_code)), [clients])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">GTM Strategies</h1>
        <p className="text-slate-500">View and manage client strategies</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{liveStrategies.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-600">{approved}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">In Review</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">{inReview}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Draft</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-600">{draft}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {tabs.map(tab => {
          const count = tab === 'all'
            ? liveStrategies.length
            : liveStrategies.filter(s => s.status === tab).length
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
              {tab === 'all' ? 'All' : tab.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
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
          <CardTitle>Strategies</CardTitle>
          <CardDescription>All client GTM strategies and approval status</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map(strategy => {
                const client = clientMap.get(strategy.client_id)
                return (
                  <TableRow key={strategy.id}>
                    <TableCell className="font-medium">
                      {client ? (
                        <Link href={`/clients/${client.client_code}/strategy`} className="hover:underline">
                          <Badge variant="outline" className="font-mono text-xs mr-2">{client.client_code}</Badge>
                          {client.name}
                        </Link>
                      ) : (
                        'Unknown'
                      )}
                    </TableCell>
                    <TableCell>v{strategy.version}</TableCell>
                    <TableCell>{statusBadge(strategy.status)}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {new Date(strategy.updated_at).toLocaleDateString('nl-NL')}
                    </TableCell>
                  </TableRow>
                )
              })}
              {paginated.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-slate-500">No strategies found</TableCell>
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
