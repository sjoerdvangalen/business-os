'use client'

import { useState, useMemo } from 'react'
import { useRealtimeTable } from '@/lib/supabase/realtime'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface Alert {
  id: string
  alert_type: string
  message: string | null
  severity: string | null
  metadata: Record<string, unknown> | null
  client_id: string | null
  campaign_id: string | null
  resolved_at: string | null
  created_at: string
}

interface ClientName {
  id: string
  name: string
  client_code: string
}

const tabs = ['all', 'critical', 'warning', 'info', 'resolved']
const pageSizes = [100, 500, 1000]

function severityBadge(severity: string | null) {
  switch (severity) {
    case 'critical': return <Badge variant="destructive">Critical</Badge>
    case 'warning': return <Badge className="bg-amber-500">Warning</Badge>
    default: return <Badge variant="secondary">Info</Badge>
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function AlertsShell({
  alerts,
  clients,
}: {
  alerts: Alert[]
  clients: ClientName[]
}) {
  const liveAlerts = useRealtimeTable(alerts, 'alerts')

  const [activeTab, setActiveTab] = useState('all')
  const [clientFilter, setClientFilter] = useState('all')
  const [pageSize, setPageSize] = useState(100)
  const [page, setPage] = useState(1)

  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients])

  const filtered = useMemo(() => {
    let list = [...liveAlerts]
    if (activeTab === 'resolved') {
      list = list.filter(a => a.resolved_at)
    } else if (activeTab !== 'all') {
      list = list.filter(a => !a.resolved_at && a.severity === activeTab)
    }
    if (clientFilter !== 'all') {
      list = list.filter(a => a.client_id === clientFilter)
    }
    return list
  }, [liveAlerts, activeTab, clientFilter])

  const totalCount = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  const unresolved = liveAlerts.filter(a => !a.resolved_at)
  const critical = unresolved.filter(a => a.severity === 'critical').length
  const warning = unresolved.filter(a => a.severity === 'warning').length
  const info = unresolved.filter(a => a.severity !== 'critical' && a.severity !== 'warning').length
  const resolved = liveAlerts.filter(a => a.resolved_at).length

  const sortedClients = useMemo(() => [...clients].sort((a, b) => a.client_code.localeCompare(b.client_code)), [clients])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Alerts</h1>
        <p className="text-slate-500">System alerts and notifications</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Critical</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-600">{critical}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Warning</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-600">{warning}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Info</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-600">{info}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Resolved</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{resolved}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {tabs.map(tab => {
          let count: number
          if (tab === 'all') count = alerts.length
          else if (tab === 'resolved') count = resolved
          else count = alerts.filter(a => !a.resolved_at && a.severity === tab).length
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
          <CardTitle className="text-base">Alerts ({totalCount})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map(alert => {
                const client = alert.client_id ? clientMap.get(alert.client_id) : null
                return (
                  <TableRow key={alert.id}>
                    <TableCell>{severityBadge(alert.severity)}</TableCell>
                    <TableCell className="max-w-[400px] truncate">
                      <span className="font-medium text-sm">{alert.alert_type}</span>
                      {alert.message && (
                        <p className="text-xs text-muted-foreground truncate">{alert.message}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      {client ? (
                        <Badge variant="outline" className="font-mono text-xs">{client.client_code}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {timeAgo(alert.created_at)}
                    </TableCell>
                  </TableRow>
                )
              })}
              {paginated.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-slate-500">No alerts found</TableCell>
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
