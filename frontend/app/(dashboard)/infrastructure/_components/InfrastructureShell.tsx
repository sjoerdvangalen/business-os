'use client'

import { useState, useMemo, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useRealtimeTable } from '@/lib/supabase/realtime'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface Domain {
  id: string
  domain: string
  client_id: string | null
  spf_status: string | null
  dkim_status: string | null
  dmarc_status: string | null
  health_score: number | null
  created_at: string
}

interface Inbox {
  id: string
  email: string
  client_id: string | null
  status: string | null
  warmup_score: number | null
  daily_send_limit: number | null
  sent_today: number | null
  created_at: string
}

interface ClientName {
  id: string
  name: string
  client_code: string
}

const pageSizes = [100, 500, 1000]

const domainTabs = ['all', 'valid', 'invalid', 'pending']
const inboxTabs = ['all', 'connected', 'active', 'disconnected', 'bouncing', 'paused', 'disabled']

function dnsBadge(status: string | null) {
  switch (status) {
    case 'valid': return <Badge className="bg-emerald-500">Valid</Badge>
    case 'invalid': return <Badge variant="destructive">Invalid</Badge>
    case 'pending': return <Badge variant="secondary">Pending</Badge>
    default: return <Badge variant="outline">{status || 'Unknown'}</Badge>
  }
}

function inboxStatusBadge(status: string | null) {
  switch (status) {
    case 'connected': return <Badge className="bg-emerald-500">Connected</Badge>
    case 'active': return <Badge className="bg-emerald-500">Active</Badge>
    case 'disconnected': return <Badge variant="destructive">Disconnected</Badge>
    case 'bouncing': return <Badge className="bg-red-600">Bouncing</Badge>
    case 'paused': return <Badge variant="secondary">Paused</Badge>
    case 'disabled': return <Badge variant="secondary">Disabled</Badge>
    default: return <Badge variant="outline">{status || 'Unknown'}</Badge>
  }
}

export default function InfrastructureShell({
  domains,
  inboxes,
  clients,
}: {
  domains: Domain[]
  inboxes: Inbox[]
  clients: ClientName[]
}) {
  const liveDomains = useRealtimeTable(domains, 'domains')
  const liveInboxes = useRealtimeTable(inboxes, 'email_inboxes')

  const searchParams = useSearchParams()
  const router = useRouter()
  const viewParam = searchParams.get('view')
  const initialView = viewParam === 'inboxes' ? 'inboxes' : 'domains'

  const [activeView, setActiveViewState] = useState<'domains' | 'inboxes'>(initialView)
  const [domainTab, setDomainTab] = useState('all')
  const [inboxTab, setInboxTab] = useState('all')
  const [clientFilter, setClientFilter] = useState('all')
  const [pageSize, setPageSize] = useState(100)
  const [page, setPage] = useState(1)

  const setActiveView = useCallback((view: 'domains' | 'inboxes') => {
    setActiveViewState(view)
    setPage(1)
    const params = new URLSearchParams(searchParams.toString())
    if (view === 'domains') {
      params.delete('view')
    } else {
      params.set('view', view)
    }
    router.replace(`/infrastructure?${params.toString()}`, { scroll: false })
  }, [searchParams, router])

  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients])

  const filteredDomains = useMemo(() => {
    let list = [...liveDomains]
    if (domainTab !== 'all') {
      list = list.filter(d => d.spf_status === domainTab || d.dkim_status === domainTab || d.dmarc_status === domainTab)
    }
    if (clientFilter !== 'all') {
      list = list.filter(d => d.client_id === clientFilter)
    }
    return list
  }, [liveDomains, domainTab, clientFilter])

  const filteredInboxes = useMemo(() => {
    let list = [...liveInboxes]
    if (inboxTab !== 'all') {
      list = list.filter(i => i.status === inboxTab)
    }
    if (clientFilter !== 'all') {
      list = list.filter(i => i.client_id === clientFilter)
    }
    return list
  }, [liveInboxes, inboxTab, clientFilter])

  const domainTotal = filteredDomains.length
  const inboxTotal = filteredInboxes.length
  const totalCount = activeView === 'domains' ? domainTotal : inboxTotal
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginatedDomains = filteredDomains.slice((safePage - 1) * pageSize, safePage * pageSize)
  const paginatedInboxes = filteredInboxes.slice((safePage - 1) * pageSize, safePage * pageSize)

  const validSpf = liveDomains.filter(d => d.spf_status === 'valid').length
  const validDkim = liveDomains.filter(d => d.dkim_status === 'valid').length
  const validDmarc = liveDomains.filter(d => d.dmarc_status === 'valid').length
  const connectedInboxes = liveInboxes.filter(i => i.status === 'connected' || i.status === 'active').length
  const bouncingInboxes = liveInboxes.filter(i => i.status === 'bouncing').length

  const sortedClients = useMemo(() => [...clients].sort((a, b) => a.client_code.localeCompare(b.client_code)), [clients])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Infrastructure</h1>
        <p className="text-slate-500">Email infrastructure overview</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Domains</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{liveDomains.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">SPF Valid</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-600">{validSpf}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Inboxes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{liveInboxes.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Connected</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-600">{connectedInboxes}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => { setActiveView('domains'); setDomainTab('all'); setPage(1) }}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            activeView === 'domains' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Domains
          <span className="ml-1.5 text-xs opacity-70">({liveDomains.length})</span>
        </button>
        <button
          onClick={() => { setActiveView('inboxes'); setInboxTab('all'); setPage(1) }}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            activeView === 'inboxes' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Inboxes
          <span className="ml-1.5 text-xs opacity-70">({liveInboxes.length})</span>
        </button>
      </div>

      {activeView === 'domains' && (
        <div className="flex flex-wrap items-center gap-3">
          {domainTabs.map(tab => {
            const count = tab === 'all'
              ? liveDomains.length
              : liveDomains.filter(d => d.spf_status === tab || d.dkim_status === tab || d.dmarc_status === tab).length
            return (
              <button
                key={tab}
                onClick={() => { setDomainTab(tab); setPage(1) }}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  domainTab === tab
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
      )}

      {activeView === 'inboxes' && (
        <div className="flex flex-wrap items-center gap-3">
          {inboxTabs.map(tab => {
            const count = tab === 'all'
              ? liveInboxes.length
              : liveInboxes.filter(i => i.status === tab).length
            return (
              <button
                key={tab}
                onClick={() => { setInboxTab(tab); setPage(1) }}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  inboxTab === tab
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
      )}

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

      {activeView === 'domains' ? (
        <Card>
          <CardHeader>
            <CardTitle>Domains</CardTitle>
            <CardDescription>Email sending domains and DNS health</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>SPF</TableHead>
                  <TableHead>DKIM</TableHead>
                  <TableHead>DMARC</TableHead>
                  <TableHead className="text-right">Health</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedDomains.map(domain => {
                  const client = domain.client_id ? clientMap.get(domain.client_id) : null
                  return (
                    <TableRow key={domain.id}>
                      <TableCell className="font-medium">{domain.domain}</TableCell>
                      <TableCell>
                        {client ? <Badge variant="outline" className="font-mono text-xs">{client.client_code}</Badge> : '—'}
                      </TableCell>
                      <TableCell>{dnsBadge(domain.spf_status)}</TableCell>
                      <TableCell>{dnsBadge(domain.dkim_status)}</TableCell>
                      <TableCell>{dnsBadge(domain.dmarc_status)}</TableCell>
                      <TableCell className="text-right">
                        {domain.health_score !== null ? (
                          <span className={`font-medium ${domain.health_score >= 90 ? 'text-emerald-600' : domain.health_score >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                            {domain.health_score}%
                          </span>
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {paginatedDomains.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-slate-500">No domains found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Email Inboxes</CardTitle>
            <CardDescription>Warmed email accounts and send limits</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Warmup</TableHead>
                  <TableHead className="text-right">Daily Limit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedInboxes.map(inbox => {
                  const client = inbox.client_id ? clientMap.get(inbox.client_id) : null
                  return (
                    <TableRow key={inbox.id}>
                      <TableCell className="font-medium">{inbox.email}</TableCell>
                      <TableCell>
                        {client ? <Badge variant="outline" className="font-mono text-xs">{client.client_code}</Badge> : '—'}
                      </TableCell>
                      <TableCell>{inboxStatusBadge(inbox.status)}</TableCell>
                      <TableCell>{inbox.warmup_score ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        <span className={`font-medium ${inbox.sent_today && inbox.daily_send_limit && inbox.sent_today >= inbox.daily_send_limit ? 'text-red-600' : ''}`}>
                          {(inbox.sent_today ?? 0).toLocaleString('nl-NL')} / {inbox.daily_send_limit ? inbox.daily_send_limit.toLocaleString('nl-NL') : '—'}
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {paginatedInboxes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-slate-500">No inboxes found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

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
