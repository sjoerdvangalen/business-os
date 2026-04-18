'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Target, Plus, Filter, Search, RefreshCw, Eye, EyeOff, Rocket, Mail } from 'lucide-react'
import type { CampaignCell, CampaignCellBrief } from '@/app/types'

interface SequenceStepPreview {
  order: number
  subject: string
  wait_in_days: number
  body_preview: string
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

interface CellsGridProps {
  initialCells: CampaignCell[]
  clientId: string
  clientCode: string
}

export default function CellsGrid({ initialCells, clientId, clientCode }: CellsGridProps) {
  const [cells, setCells] = useState<CampaignCell[]>(initialCells)
  const [globalFilter, setGlobalFilter] = useState('')
  const [expandedCellId, setExpandedCellId] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<Record<string, SequenceStepPreview[]>>({})
  const [previewLoading, setPreviewLoading] = useState<Record<string, boolean>>({})
  const [pushLoading, setPushLoading] = useState<Record<string, boolean>>({})
  const supabase = createClient()

  async function togglePreview(cellId: string) {
    if (expandedCellId === cellId) {
      setExpandedCellId(null)
      return
    }

    setExpandedCellId(cellId)

    if (!previewData[cellId]) {
      setPreviewLoading((prev) => ({ ...prev, [cellId]: true }))
      try {
        const { data, error } = await supabase.functions.invoke('gtm-campaign-push', {
          body: { cell_id: cellId, mode: 'review' },
        })

        if (error || !data?.success) {
          toast.error(data?.error || 'Failed to load sequence preview')
          setPreviewLoading((prev) => ({ ...prev, [cellId]: false }))
          return
        }

        setPreviewData((prev) => ({ ...prev, [cellId]: data.sequence_steps || [] }))
      } catch (err) {
        toast.error('Failed to load sequence preview')
        console.error(err)
      }
      setPreviewLoading((prev) => ({ ...prev, [cellId]: false }))
    }
  }

  async function pushCampaign(cellId: string) {
    setPushLoading((prev) => ({ ...prev, [cellId]: true }))
    try {
      const { data, error } = await supabase.functions.invoke('gtm-campaign-push', {
        body: { cell_id: cellId, mode: 'immediate' },
      })

      if (error || !data?.success) {
        toast.error(data?.error || 'Failed to push campaign')
        setPushLoading((prev) => ({ ...prev, [cellId]: false }))
        return
      }

      toast.success(`Campaign pushed! ${data.leads_pushed || 0} leads added.`)

      setCells((prev) =>
        prev.map((c) => (c.id === cellId ? { ...c, status: 'H1_testing' } : c))
      )
    } catch (err) {
      toast.error('Failed to push campaign')
      console.error(err)
    }
    setPushLoading((prev) => ({ ...prev, [cellId]: false }))
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
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RefreshCw className="mr-2 h-4 w-4" />
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
              <p>{cells.length === 0 ? 'No campaign cells found' : 'No matching cells'}</p>
              {cells.length === 0 && (
                <p className="text-sm mt-2">
                  Cells will be generated after strategy approval
                </p>
              )}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredCells.map((cell) => {
                const parsed = parseCellCode(cell.cell_code)
                const isExpanded = expandedCellId === cell.id
                const preview = previewData[cell.id]
                const isPreviewLoading = previewLoading[cell.id]
                const isPushLoading = pushLoading[cell.id]
                const canPush = cell.status === 'ready'
                const brief = cell.brief as CampaignCellBrief | null
                const hasHooks = !!brief?.hook_frameworks

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

                      <div className="flex items-center gap-2 mt-4 pt-3 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => togglePreview(cell.id)}
                          disabled={isPreviewLoading}
                        >
                          {isPreviewLoading ? (
                            <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                          ) : isExpanded ? (
                            <EyeOff className="mr-1 h-3 w-3" />
                          ) : (
                            <Eye className="mr-1 h-3 w-3" />
                          )}
                          {isExpanded ? 'Hide' : 'Preview'}
                        </Button>
                        <Button
                          variant={canPush ? 'default' : 'outline'}
                          size="sm"
                          className="flex-1"
                          onClick={() => pushCampaign(cell.id)}
                          disabled={isPushLoading || !canPush}
                        >
                          {isPushLoading ? (
                            <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Rocket className="mr-1 h-3 w-3" />
                          )}
                          Push
                        </Button>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t bg-slate-50 -mx-6 px-6 -mb-6 pb-6 rounded-b-lg">
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            Sequence Preview
                          </h4>
                          {isPreviewLoading ? (
                            <div className="text-sm text-slate-500 py-2">Loading preview...</div>
                          ) : preview && preview.length > 0 ? (
                            <div className="space-y-3">
                              {preview.map((step, idx) => (
                                <div key={idx} className="text-sm border-l-2 border-blue-300 pl-3">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[10px] h-5">
                                      Step {step.order}
                                    </Badge>
                                    <span className="text-xs text-slate-500">
                                      Wait {step.wait_in_days}d
                                    </span>
                                  </div>
                                  <p className="font-medium text-slate-700 mt-1">
                                    {step.subject}
                                  </p>
                                  <p className="text-slate-500 text-xs mt-0.5 line-clamp-3">
                                    {step.body_preview}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : hasHooks ? (
                            <div className="text-sm text-slate-500 py-2">
                              Click Preview to generate sequence from cell messaging.
                            </div>
                          ) : (
                            <div className="text-sm text-slate-500 py-2">
                              No messaging available. Run messaging enrichment first.
                            </div>
                          )}
                        </div>
                      )}
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
