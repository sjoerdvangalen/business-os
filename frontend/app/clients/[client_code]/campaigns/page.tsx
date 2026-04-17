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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  Mail,
  TrendingUp,
  Users,
  Search,
  RefreshCw,
  ArrowUpDown,
  Calendar,
  AlertCircle,
  CheckCircle,
  XCircle,
} from 'lucide-react'

interface Campaign {
  id: string
  client_id: string
  name: string
  status: string
  health_status: string | null
  provider: string | null
  campaign_type: string | null
  emails_sent: number
  unique_opens: number
  replies: number
  positive_replies: number
  neutral_replies: number
  negative_replies: number
  open_rate: number | null
  reply_rate: number | null
  positive_rate: number | null
  bounce_rate: number | null
  bounces: number
  unsubscribes: number
  total_leads: number
  leads_contacted: number
  created_at: string
  updated_at: string
  start_date: string | null
  end_date: string | null
}

interface CampaignsPageProps {
  params: Promise<{ client_code: string }>
}

const healthConfig: Record<string, { label: string; color: string; icon: any }> = {
  HEALTHY: { label: 'Healthy', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  WARNING: { label: 'Warning', color: 'bg-yellow-100 text-yellow-800', icon: AlertCircle },
  CRITICAL: { label: 'Critical', color: 'bg-red-100 text-red-800', icon: XCircle },
  UNKNOWN: { label: 'Unknown', color: 'bg-gray-100 text-gray-800', icon: AlertCircle },
}

const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-green-100 text-green-800' },
  paused: { label: 'Paused', color: 'bg-yellow-100 text-yellow-800' },
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
  completed: { label: 'Completed', color: 'bg-blue-100 text-blue-800' },
  archived: { label: 'Archived', color: 'bg-gray-100 text-gray-800' },
}

function HealthBadge({ health }: { health: string | null }) {
  const config = healthConfig[health || 'UNKNOWN'] || healthConfig['UNKNOWN']
  const Icon = config.icon
  return (
    <Badge className={config.color} variant="secondary">
      <Icon className="mr-1 h-3 w-3" />
      {config.label}
    </Badge>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { label: status, color: 'bg-gray-100 text-gray-800' }
  return (
    <Badge className={config.color} variant="secondary">
      {config.label}
    </Badge>
  )
}

function formatRate(rate: number | null): string {
  if (rate === null || rate === undefined) return '—'
  return `${rate.toFixed(1)}%`
}

function formatNumber(num: number | null): string {
  if (num === null || num === undefined) return '—'
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}k`
  }
  return num.toString()
}

export default function CampaignsPage({ params }: CampaignsPageProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [clientId, setClientId] = useState<string | null>(null)
  const [meetingsCount, setMeetingsCount] = useState(0)
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const resolvedParams = params
  const supabase = createClient()

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const { client_code } = await resolvedParams

      // First get client_id from client_code
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('id')
        .eq('client_code', client_code.toUpperCase())
        .single()

      if (clientError || !clientData) {
        toast.error('Client not found')
        setLoading(false)
        return
      }

      setClientId(clientData.id)

      // Fetch campaigns for this client
      const { data: campaignsData, error: campaignsError } = await supabase
        .from('campaigns')
        .select('*')
        .eq('client_id', clientData.id)
        .order('created_at', { ascending: false })

      if (campaignsError) {
        toast.error('Failed to load campaigns')
        console.error(campaignsError)
      } else {
        setCampaigns(campaignsData || [])
      }

      // Fetch meetings count for this client
      const { count: meetingsCountData, error: meetingsError } = await supabase
        .from('meetings')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientData.id)

      if (meetingsError) {
        console.error('Error fetching meetings:', meetingsError)
      } else {
        setMeetingsCount(meetingsCountData || 0)
      }
    } catch (error) {
      console.error('Error fetching data:', error)
      toast.error('An error occurred while loading data')
    }
    setLoading(false)
  }

  const stats = useMemo(() => {
    const active = campaigns.filter((c) => c.status === 'active')
    const totalSent = campaigns.reduce((sum, c) => sum + (c.emails_sent || 0), 0)
    const totalReplies = campaigns.reduce((sum, c) => sum + (c.replies || 0), 0)
    const avgReplyRate = totalSent > 0 ? (totalReplies / totalSent) * 100 : null

    return {
      activeCampaigns: active.length,
      totalSent,
      replyRate: avgReplyRate,
      meetingsBooked: meetingsCount,
      healthyCampaigns: campaigns.filter((c) => c.health_status === 'HEALTHY').length,
    }
  }, [campaigns, meetingsCount])

  const columns: ColumnDef<Campaign>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="h-8 px-2"
          >
            <Mail className="mr-2 h-4 w-4" />
            Campaign Name
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.name}</span>
            <span className="text-xs text-muted-foreground">
              {row.original.provider} • {row.original.campaign_type}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'health_status',
        header: 'Health',
        cell: ({ row }) => <HealthBadge health={row.original.health_status} />,
      },
      {
        accessorKey: 'emails_sent',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="h-8 px-2"
          >
            Sent
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => formatNumber(row.original.emails_sent),
      },
      {
        accessorKey: 'reply_rate',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="h-8 px-2"
          >
            Reply Rate
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const rate = row.original.reply_rate
          return (
            <div className="flex flex-col">
              <span className={rate && rate > 5 ? 'text-green-600 font-medium' : ''}>
                {formatRate(rate)}
              </span>
              <span className="text-xs text-muted-foreground">
                {row.original.replies || 0} replies
              </span>
            </div>
          )
        },
      },
      {
        accessorKey: 'open_rate',
        header: 'Open Rate',
        cell: ({ row }) => formatRate(row.original.open_rate),
      },
      {
        accessorKey: 'positive_rate',
        header: 'Positive',
        cell: ({ row }) => {
          const rate = row.original.positive_rate
          return (
            <span className={rate && rate > 2 ? 'text-green-600' : ''}>
              {formatRate(rate)}
            </span>
          )
        },
      },
      {
        accessorKey: 'bounce_rate',
        header: 'Bounce',
        cell: ({ row }) => {
          const rate = row.original.bounce_rate
          return (
            <span className={rate && rate > 5 ? 'text-red-600' : ''}>
              {formatRate(rate)}
            </span>
          )
        },
      },
      {
        accessorKey: 'leads_contacted',
        header: 'Leads',
        cell: ({ row }) => (
          <span>
            {row.original.leads_contacted || 0} / {row.original.total_leads || 0}
          </span>
        ),
      },
      {
        accessorKey: 'updated_at',
        header: 'Last Updated',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {new Date(row.original.updated_at).toLocaleDateString()}
          </span>
        ),
      },
    ],
    []
  )

  const table = useReactTable({
    data: campaigns,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Campaigns</h2>
          <p className="text-muted-foreground">
            Email campaigns and performance metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline">
            <TrendingUp className="mr-2 h-4 w-4" />
            View Analytics
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Campaigns</CardDescription>
            <CardTitle className="text-2xl">{stats.activeCampaigns}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Sent</CardDescription>
            <CardTitle className="text-2xl">{formatNumber(stats.totalSent)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Reply Rate</CardDescription>
            <CardTitle className="text-2xl">
              {stats.replyRate ? `${stats.replyRate.toFixed(1)}%` : '—'}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Meetings Booked</CardDescription>
            <CardTitle className="text-2xl">{stats.meetingsBooked}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Health Score</CardDescription>
            <CardTitle className="text-2xl">
              {campaigns.length > 0
                ? `${Math.round((stats.healthyCampaigns / campaigns.length) * 100)}%`
                : '—'}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search campaigns..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Campaign List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Active Campaigns
          </CardTitle>
          <CardDescription>
            {campaigns.length} email campaigns for this client
          </CardDescription>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mail className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>{loading ? 'Loading...' : 'No active campaigns'}</p>
              {!loading && (
                <p className="text-sm mt-2">
                  Campaigns will appear here after launch
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-md border">
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
                        No campaigns found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
