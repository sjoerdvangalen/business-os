'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Target, Plus, Filter, Search, RefreshCw } from 'lucide-react'
import type { CampaignCell } from '@/app/types'

interface CellsPageProps {
  params: Promise<{ client_code: string }>
}

const statusConfig: Record<string, { label: string; color: string }> = {
  sourcing_pending: { label: 'Sourcing Pending', color: 'bg-yellow-100 text-yellow-800' },
  sourcing_failed: { label: 'Sourcing Failed', color: 'bg-red-100 text-red-800' },
  messaging_revision: { label: 'Messaging Revision', color: 'bg-amber-100 text-amber-800' },
  ready: { label: 'Ready', color: 'bg-blue-100 text-blue-800' },
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
  pilot_copy: { label: 'Pilot Copy', color: 'bg-purple-100 text-purple-800' },
  H1_testing: { label: 'H1 Testing', color: 'bg-orange-100 text-orange-800' },
  H1_winner: { label: 'H1 Winner', color: 'bg-green-100 text-green-800' },
  F1_testing: { label: 'F1 Testing', color: 'bg-orange-100 text-orange-800' },
  F1_winner: { label: 'F1 Winner', color: 'bg-green-100 text-green-800' },
  CTA1_testing: { label: 'CTA1 Testing', color: 'bg-orange-100 text-orange-800' },
  soft_launch: { label: 'Soft Launch', color: 'bg-teal-100 text-teal-800' },
  scaling: { label: 'Scaling', color: 'bg-green-100 text-green-800' },
  killed: { label: 'Killed', color: 'bg-red-100 text-red-800' },
}

function parseCellCode(cellCode: string) {
  const parts = cellCode.split('|')
  return {
    client: parts[0] || '',
    language: parts[1] || '',
    solution: parts[2] || '',
    icp: parts[3] || '',
    vertical: parts[4] || '',
    persona: parts[5] || '',
    geo: parts[6] || '',
  }
}

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { label: status, color: 'bg-gray-100 text-gray-800' }
  return (
    <Badge className={config.color} variant="secondary">
      {config.label}
    </Badge>
  )
}

export default function CellsPage({ params }: CellsPageProps) {
  const [cells, setCells] = useState<CampaignCell[]>([])
  const [loading, setLoading] = useState(true)
  const [clientId, setClientId] = useState<string | null>(null)
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

      // Fetch campaign cells for this client
      const { data: cellsData, error: cellsError } = await supabase
        .from('campaign_cells')
        .select('*')
        .eq('client_id', clientData.id)
        .order('created_at', { ascending: false })

      if (cellsError) {
        toast.error('Failed to load campaign cells')
        console.error(cellsError)
      } else {
        setCells(cellsData || [])
      }
    } catch (error) {
      console.error('Error fetching data:', error)
      toast.error('An error occurred while loading data')
    }
    setLoading(false)
  }

  const filteredCells = cells.filter((cell) => {
    if (!globalFilter) return true
    const search = globalFilter.toLowerCase()
    const parsed = parseCellCode(cell.cell_code)
    return (
      cell.cell_code.toLowerCase().includes(search) ||
      cell.status.toLowerCase().includes(search) ||
      parsed.solution.toLowerCase().includes(search) ||
      parsed.icp.toLowerCase().includes(search) ||
      parsed.vertical.toLowerCase().includes(search) ||
      parsed.persona.toLowerCase().includes(search)
    )
  })

  const stats = {
    total: cells.length,
    sourcing_pending: cells.filter((c) => c.status === 'sourcing_pending').length,
    ready: cells.filter((c) => c.status === 'ready').length,
    H1_testing: cells.filter((c) => c.status === 'H1_testing').length,
    scaling: cells.filter((c) => c.status === 'scaling').length,
    killed: cells.filter((c) => c.status === 'killed').length,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Campaign Cells</h2>
          <p className="text-muted-foreground">
            Manage execution units (solution × ICP × vertical × persona)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline">
            <Filter className="mr-2 h-4 w-4" />
            Filter
          </Button>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Cell
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Cells</CardDescription>
            <CardTitle className="text-2xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sourcing Pending</CardDescription>
            <CardTitle className="text-xl">{stats.sourcing_pending}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ready</CardDescription>
            <CardTitle className="text-xl">{stats.ready}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>H1 Testing</CardDescription>
            <CardTitle className="text-xl">{stats.H1_testing}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Scaling</CardDescription>
            <CardTitle className="text-xl">{stats.scaling}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Killed</CardDescription>
            <CardTitle className="text-xl">{stats.killed}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search cells..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Cells Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Campaign Cells
          </CardTitle>
          <CardDescription>
            {filteredCells.length} of {cells.length} execution cells
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredCells.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Target className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>{loading ? 'Loading...' : 'No campaign cells found'}</p>
              {!loading && cells.length === 0 && (
                <p className="text-sm mt-2">
                  Cells will be generated after strategy approval
                </p>
              )}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredCells.map((cell) => {
                const parsed = parseCellCode(cell.cell_code)
                return (
                  <Card key={cell.id} className="border-l-4 border-l-blue-500">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-sm font-mono text-muted-foreground">
                            {cell.cell_code}
                          </CardTitle>
                          <p className="text-lg font-semibold mt-1">
                            {parsed.solution}
                          </p>
                        </div>
                        <StatusBadge status={cell.status} />
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">ICP:</span>
                          <span className="font-medium">{parsed.icp}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Vertical:</span>
                          <span className="font-medium">{parsed.vertical}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Persona:</span>
                          <span className="font-medium">{parsed.persona}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Region:</span>
                          <span className="font-medium">{parsed.geo}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Language:</span>
                          <span className="font-medium">{parsed.language}</span>
                        </div>
                        {cell.brief?.target_job_title_families && (
                          <div className="pt-2 border-t">
                            <span className="text-muted-foreground">Job Titles:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {cell.brief.target_job_title_families.slice(0, 3).map((title, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {title}
                                </Badge>
                              ))}
                              {cell.brief.target_job_title_families.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{cell.brief.target_job_title_families.length - 3}
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
