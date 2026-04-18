'use client'

import { useState, useMemo } from 'react'
import { useRealtimeTable } from '@/lib/supabase/realtime'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface Meeting {
  id: string
  name: string | null
  start_time: string | null
  end_time: string | null
  status: string | null
  booking_status: string | null
  attendee_name: string | null
  attendee_email: string | null
  client_id: string | null
  created_at: string
}

interface ClientName {
  id: string
  name: string
  client_code: string
}

const tabs = ['all', 'confirmed', 'completed', 'cancelled', 'pending']
const pageSizes = [100, 500, 1000]

function statusBadge(status: string | null) {
  switch (status) {
    case 'confirmed': return <Badge className="bg-emerald-500">Confirmed</Badge>
    case 'completed': return <Badge variant="secondary">Completed</Badge>
    case 'cancelled': return <Badge variant="destructive">Cancelled</Badge>
    case 'pending': return <Badge variant="secondary">Pending</Badge>
    default: return <Badge variant="outline">{status || 'Unknown'}</Badge>
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('nl-NL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function MeetingsShell({
  meetings,
  clients,
}: {
  meetings: Meeting[]
  clients: ClientName[]
}) {
  const liveMeetings = useRealtimeTable(meetings, 'meetings')

  const [activeTab, setActiveTab] = useState('all')
  const [clientFilter, setClientFilter] = useState('all')
  const [pageSize, setPageSize] = useState(100)
  const [page, setPage] = useState(1)

  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients])

  const filtered = useMemo(() => {
    let list = [...liveMeetings]
    if (activeTab !== 'all') {
      list = list.filter(m => m.status === activeTab)
    }
    if (clientFilter !== 'all') {
      list = list.filter(m => m.client_id === clientFilter)
    }
    return list
  }, [liveMeetings, activeTab, clientFilter])

  const totalCount = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  const upcoming = liveMeetings.filter(m => m.start_time && new Date(m.start_time) > new Date()).length
  const completed = liveMeetings.filter(m => m.status === 'completed').length
  const cancelled = liveMeetings.filter(m => m.status === 'cancelled').length

  const sortedClients = useMemo(() => [...clients].sort((a, b) => a.client_code.localeCompare(b.client_code)), [clients])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Meetings</h1>
        <p className="text-slate-500">Track scheduled meetings</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{liveMeetings.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Upcoming</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-600">{upcoming}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-600">{completed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Cancelled</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-600">{cancelled}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {tabs.map(tab => {
          const count = tab === 'all'
            ? liveMeetings.length
            : liveMeetings.filter(m => m.status === tab).length
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
          <CardTitle>Recent Meetings</CardTitle>
          <CardDescription>Meetings from Cal.com and GHL</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Attendee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map(meeting => {
                const client = meeting.client_id ? clientMap.get(meeting.client_id) : null
                return (
                  <TableRow key={meeting.id}>
                    <TableCell className="font-medium">{meeting.name || 'Meeting'}</TableCell>
                    <TableCell>
                      {client ? <Badge variant="outline" className="font-mono text-xs">{client.client_code}</Badge> : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{meeting.attendee_name || '—'}</div>
                      {meeting.attendee_email && (
                        <div className="text-xs text-muted-foreground truncate max-w-[180px]">{meeting.attendee_email}</div>
                      )}
                    </TableCell>
                    <TableCell>{statusBadge(meeting.status)}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {formatDate(meeting.start_time)}
                    </TableCell>
                  </TableRow>
                )
              })}
              {paginated.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-500">No meetings found</TableCell>
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
