'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Plus, MoreHorizontal, DollarSign, Building2, User, Calendar, List, Kanban } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import Link from 'next/link'

interface Opportunity {
  id: string
  title: string
  value: number | null
  stage: string
  company_id: string | null
  contact_id: string | null
  created_at: string
  close_date: string | null
  companies?: { name: string }
  contacts?: { first_name: string; last_name: string }
}

const STAGES = [
  { id: 'new', label: 'New', color: 'bg-gray-100' },
  { id: 'qualified', label: 'Qualified', color: 'bg-blue-100' },
  { id: 'proposal', label: 'Proposal', color: 'bg-yellow-100' },
  { id: 'negotiation', label: 'Negotiation', color: 'bg-orange-100' },
  { id: 'closed_won', label: 'Closed Won', color: 'bg-green-100' },
  { id: 'closed_lost', label: 'Closed Lost', color: 'bg-red-100' },
]

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [draggedItem, setDraggedItem] = useState<Opportunity | null>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchOpportunities()
  }, [])

  async function fetchOpportunities() {
    setLoading(true)
    const { data, error } = await supabase
      .from('opportunities')
      .select('*, companies(name), contacts(first_name, last_name)')
      .order('created_at', { ascending: false })

    if (error) {
      toast.error('Failed to load opportunities')
      console.error(error)
    } else {
      setOpportunities(data || [])
    }
    setLoading(false)
  }

  async function updateStage(id: string, newStage: string) {
    const { error } = await supabase
      .from('opportunities')
      .update({ stage: newStage })
      .eq('id', id)

    if (error) {
      toast.error('Failed to update stage')
      console.error(error)
    } else {
      setOpportunities((prev) =>
        prev.map((opp) => (opp.id === id ? { ...opp, stage: newStage } : opp))
      )
      toast.success(`Moved to ${STAGES.find((s) => s.id === newStage)?.label}`)
    }
  }

  function handleDragStart(opp: Opportunity) {
    setDraggedItem(opp)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  function handleDrop(e: React.DragEvent, stageId: string) {
    e.preventDefault()
    if (draggedItem && draggedItem.stage !== stageId) {
      updateStage(draggedItem.id, stageId)
    }
    setDraggedItem(null)
  }

  const getStageTotal = (stageId: string) => {
    return opportunities
      .filter((o) => o.stage === stageId)
      .reduce((sum, o) => sum + (o.value || 0), 0)
  }

  const totalPipeline = opportunities.reduce((sum, o) => sum + (o.value || 0), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Opportunities</h1>
          <p className="text-muted-foreground">
            Total pipeline value: €{totalPipeline.toLocaleString()}
          </p>
        </div>
        <Button asChild>
          <Link href="/crm/opportunities/new">
            <Plus className="mr-2 h-4 w-4" />
            Add Opportunity
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-6">
        {STAGES.map((stage) => (
          <Card key={stage.id}>
            <CardHeader className="pb-2">
              <CardDescription>{stage.label}</CardDescription>
              <div className="flex items-baseline justify-between">
                <CardTitle className="text-xl">
                  {opportunities.filter((o) => o.stage === stage.id).length}
                </CardTitle>
                <span className="text-sm text-muted-foreground">
                  €{getStageTotal(stage.id).toLocaleString()}
                </span>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pipeline" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pipeline" className="gap-2">
            <Kanban className="h-4 w-4" />
            Pipeline
          </TabsTrigger>
          <TabsTrigger value="list" className="gap-2">
            <List className="h-4 w-4" />
            List
          </TabsTrigger>
        </TabsList>

        {/* Pipeline View */}
        <TabsContent value="pipeline" className="space-y-4">
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGES.map((stage) => (
              <div
                key={stage.id}
                className="min-w-[300px] flex-1"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, stage.id)}
              >
                <Card className="h-full">
                  <CardHeader className={`${stage.color} border-b`}>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold">{stage.label}</CardTitle>
                      <Badge variant="secondary">
                        {opportunities.filter((o) => o.stage === stage.id).length}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      €{getStageTotal(stage.id).toLocaleString()}
                    </div>
                  </CardHeader>
                  <CardContent className="p-2 space-y-2">
                    {opportunities
                      .filter((o) => o.stage === stage.id)
                      .map((opp) => (
                        <div
                          key={opp.id}
                          draggable
                          onDragStart={() => handleDragStart(opp)}
                          className="bg-white border rounded-lg p-3 shadow-sm cursor-move hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <h4 className="font-medium text-sm line-clamp-2">{opp.title}</h4>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-6 w-6 p-0 -mr-2 -mt-2">
                                  <MoreHorizontal className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                  <Link href={`/crm/opportunities/${opp.id}/edit`}>Edit</Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {STAGES.filter((s) => s.id !== opp.stage).map((s) => (
                                  <DropdownMenuItem
                                    key={s.id}
                                    onClick={() => updateStage(opp.id, s.id)}
                                  >
                                    Move to {s.label}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          {opp.value && (
                            <div className="flex items-center gap-1 text-sm font-medium text-green-600 mb-2">
                              <DollarSign className="h-3 w-3" />
                              €{opp.value.toLocaleString()}
                            </div>
                          )}

                          {opp.companies?.name && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Building2 className="h-3 w-3" />
                              {opp.companies.name}
                            </div>
                          )}

                          {opp.contacts && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <User className="h-3 w-3" />
                              {opp.contacts.first_name} {opp.contacts.last_name}
                            </div>
                          )}

                          {opp.close_date && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                              <Calendar className="h-3 w-3" />
                              {new Date(opp.close_date).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      ))}

                    {opportunities.filter((o) => o.stage === stage.id).length === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        No opportunities
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* List View */}
        <TabsContent value="list" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-medium">Title</th>
                    <th className="text-left p-4 font-medium">Value</th>
                    <th className="text-left p-4 font-medium">Stage</th>
                    <th className="text-left p-4 font-medium">Company</th>
                    <th className="text-left p-4 font-medium">Contact</th>
                    <th className="text-left p-4 font-medium">Close Date</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunities.map((opp) => (
                    <tr key={opp.id} className="border-b hover:bg-muted/50">
                      <td className="p-4 font-medium">{opp.title}</td>
                      <td className="p-4">
                        {opp.value ? `€${opp.value.toLocaleString()}` : '—'}
                      </td>
                      <td className="p-4">
                        <Badge
                          className={
                            STAGES.find((s) => s.id === opp.stage)?.color || 'bg-gray-100'
                          }
                        >
                          {STAGES.find((s) => s.id === opp.stage)?.label || opp.stage}
                        </Badge>
                      </td>
                      <td className="p-4">{opp.companies?.name || '—'}</td>
                      <td className="p-4">
                        {opp.contacts
                          ? `${opp.contacts.first_name} ${opp.contacts.last_name}`
                          : '—'}
                      </td>
                      <td className="p-4">
                        {opp.close_date
                          ? new Date(opp.close_date).toLocaleDateString()
                          : '—'}
                      </td>
                    </tr>
                  ))}
                  {opportunities.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
                        {loading ? 'Loading...' : 'No opportunities found.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
