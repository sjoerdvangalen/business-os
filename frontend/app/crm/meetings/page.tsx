'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  SortingState,
  ColumnFiltersState,
} from '@tanstack/react-table'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  ArrowUpDown,
  ChevronDown,
  MoreHorizontal,
  Plus,
  Search,
  Filter,
  Download,
  Trash2,
  Edit,
  Calendar,
  Video,
  User,
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react'
import Link from 'next/link'

interface Meeting {
  id: string
  title: string | null
  description: string | null
  start_time: string
  end_time: string | null
  status: string | null
  provider: string | null
  meeting_url: string | null
  contact_id: string | null
  company_id: string | null
  created_at: string
  contacts?: { first_name: string; last_name: string; email: string }
  companies?: { name: string }
}

export default function MeetingsPage() {
  const [data, setData] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const supabase = createClient()

  useEffect(() => {
    fetchMeetings()
  }, [])

  async function fetchMeetings() {
    setLoading(true)
    const { data: meetings, error } = await supabase
      .from('meetings')
      .select('*, contacts(first_name, last_name, email), companies(name)')
      .order('start_time', { ascending: false })

    if (error) {
      toast.error('Failed to load meetings')
      console.error(error)
    } else {
      setData(meetings || [])
    }
    setLoading(false)
  }

  async function deleteMeeting(id: string) {
    if (!confirm('Are you sure you want to delete this meeting?')) return

    const { error } = await supabase.from('meetings').delete().eq('id', id)

    if (error) {
      toast.error('Failed to delete meeting')
    } else {
      setData((prev) => prev.filter((m) => m.id !== id))
      toast.success('Meeting deleted')
    }
  }

  const exportToCSV = () => {
    const headers = ['Title', 'Start Time', 'End Time', 'Status', 'Contact', 'Company', 'Provider']
    const csv = [
      headers.join(','),
      ...data.map((m) =>
        [
          m.title || '',
          m.start_time || '',
          m.end_time || '',
          m.status || '',
          `${m.contacts?.first_name || ''} ${m.contacts?.last_name || ''}`.trim(),
          m.companies?.name || '',
          m.provider || '',
        ].map((v) => `"${v}"`).join(',')
      ),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `meetings-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Meetings exported to CSV')
  }

  const columns: ColumnDef<Meeting>[] = useMemo(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="h-8 px-2"
          >
            <Calendar className="mr-2 h-4 w-4" />
            Meeting
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const meeting = row.original
          return (
            <div>
              <div className="font-medium">{meeting.title || 'Untitled Meeting'}</div>
              {meeting.description && (
                <div className="text-sm text-muted-foreground truncate max-w-[200px]">
                  {meeting.description}
                </div>
              )}
            </div>
          )
        },
      },
      {
        accessorKey: 'start_time',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="h-8 px-2"
          >
            <Clock className="mr-2 h-4 w-4" />
            Time
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const meeting = row.original
          const start = new Date(meeting.start_time)
          const end = meeting.end_time ? new Date(meeting.end_time) : null

          return (
            <div className="text-sm">
              <div>{start.toLocaleDateString()}</div>
              <div className="text-muted-foreground">
                {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {end && ` - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.original.status
          const icons: Record<string, React.ReactNode> = {
            confirmed: <CheckCircle2 className="h-4 w-4 text-green-600" />,
            pending: <Clock className="h-4 w-4 text-yellow-600" />,
            cancelled: <XCircle className="h-4 w-4 text-red-600" />,
            completed: <CheckCircle2 className="h-4 w-4 text-blue-600" />,
          }
          const colors: Record<string, string> = {
            confirmed: 'bg-green-100 text-green-800',
            pending: 'bg-yellow-100 text-yellow-800',
            cancelled: 'bg-red-100 text-red-800',
            completed: 'bg-blue-100 text-blue-800',
          }
          return (
            <div className="flex items-center gap-2">
              {icons[status || '']}
              <Badge className={colors[status || ''] || 'bg-gray-100 text-gray-800'}>
                {status || '—'}
              </Badge>
            </div>
          )
        },
      },
      {
        accessorKey: 'contacts',
        header: 'Contact',
        cell: ({ row }) => {
          const meeting = row.original
          const fullName = `${meeting.contacts?.first_name || ''} ${meeting.contacts?.last_name || ''}`.trim()
          return (
            <div className="flex items-center gap-1 text-sm">
              <User className="h-3 w-3 text-muted-foreground" />
              <div>
                <div>{fullName || '—'}</div>
                {meeting.contacts?.email && (
                  <div className="text-xs text-muted-foreground">{meeting.contacts.email}</div>
                )}
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: 'companies',
        header: 'Company',
        cell: ({ row }) => {
          const meeting = row.original
          return (
            <div className="flex items-center gap-1 text-sm">
              <Building2 className="h-3 w-3 text-muted-foreground" />
              {meeting.companies?.name || '—'}
            </div>
          )
        },
      },
      {
        accessorKey: 'provider',
        header: 'Provider',
        cell: ({ row }) => {
          const meeting = row.original
          return (
            <div className="flex items-center gap-1 text-sm">
              <Video className="h-3 w-3 text-muted-foreground" />
              {meeting.provider || '—'}
            </div>
          )
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const meeting = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {meeting.meeting_url && (
                  <DropdownMenuItem asChild>
                    <a href={meeting.meeting_url} target="_blank" rel="noopener noreferrer">
                      <Video className="mr-2 h-4 w-4" />
                      Join Meeting
                    </a>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => deleteMeeting(meeting.id)}
                  className="text-red-600"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    []
  )

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
  })

  const upcomingCount = data.filter((m) =>
    m.status === 'confirmed' && new Date(m.start_time) > new Date()
  ).length

  const todayCount = data.filter((m) => {
    const meetingDate = new Date(m.start_time)
    const today = new Date()
    return (
      meetingDate.getDate() === today.getDate() &&
      meetingDate.getMonth() === today.getMonth() &&
      meetingDate.getFullYear() === today.getFullYear()
    )
  }).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Meetings</h1>
          <p className="text-muted-foreground">
            Track scheduled meetings from Cal.com and GHL.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={exportToCSV}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button asChild>
            <Link href="/crm/meetings/new">
              <Plus className="mr-2 h-4 w-4" />
              Schedule Meeting
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Meetings</CardDescription>
            <CardTitle className="text-2xl">{data.length.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Today</CardDescription>
            <CardTitle className="text-2xl">{todayCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Upcoming</CardDescription>
            <CardTitle className="text-2xl">{upcomingCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed</CardDescription>
            <CardTitle className="text-2xl">
              {data.filter((m) => m.status === 'completed').length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search meetings..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Filter className="mr-2 h-4 w-4" />
              Columns
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <DropdownMenuItem
                  key={column.id}
                  className="capitalize"
                  onClick={() => column.toggleVisibility(!column.getIsVisible())}
                >
                  <input
                    type="checkbox"
                    checked={column.getIsVisible()}
                    onChange={() => {}}
                    className="mr-2"
                  />
                  {column.id}
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    {loading ? 'Loading...' : 'No meetings found.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
