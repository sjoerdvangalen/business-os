'use client'

import type { ProjectEvent } from '@/app/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

interface ProjectEventDrawerProps {
  event: ProjectEvent | null
  onClose: () => void
}

const statusColors: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-blue-100 text-blue-700',
  review: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  blocked: 'bg-red-100 text-red-700',
  overdue: 'bg-red-100 text-red-700',
}

const severityColors: Record<string, string> = {
  info: 'bg-slate-100 text-slate-700',
  warning: 'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
}

function formatDateTime(date: string | null): string {
  if (!date) return '—'
  const d = new Date(date)
  return d.toLocaleString('nl-NL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ProjectEventDrawer({ event, onClose }: ProjectEventDrawerProps) {
  if (!event) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white border-l shadow-xl z-50 flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b"
        >
          <h3 className="text-lg font-semibold"
          >Event Details</h3>
          <Button variant="ghost" size="sm" onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6"
        >
          {/* Title & Type */}
          <div>
            <h4 className="text-xl font-bold mb-2"
            >{event.title}</h4>
            <div className="flex flex-wrap gap-2"
            >
              <Badge className={statusColors[event.status] || statusColors.pending} variant="secondary"
              >
                {event.status}
              </Badge>
              {event.severity && (
                <Badge className={severityColors[event.severity]} variant="secondary"
                >
                  {event.severity}
                </Badge>
              )}
              <Badge variant="outline" className="capitalize"
              >
                {event.project_type.replace(/_/g, ' ')}
              </Badge>
              <Badge variant="outline" className="capitalize"
              >
                {event.event_type.replace(/_/g, ' ')}
              </Badge>
            </div>
          </div>

          {/* Description */}
          {event.description && (
            <div>
              <h5 className="text-sm font-medium text-muted-foreground mb-1"
              >Description</h5>
              <p className="text-sm"
              >{event.description}</p>
            </div>
          )}

          {/* Timeline */}
          <div className="space-y-2"
          >
            <h5 className="text-sm font-medium text-muted-foreground"
            >Timeline</h5>
            <div className="grid grid-cols-2 gap-4 text-sm"
            >
              <div>
                <span className="text-muted-foreground block text-xs"
                >Starts</span>
                <span
                >{formatDateTime(event.starts_at)}</span>
              </div>
              {event.ends_at && (
                <div>
                  <span className="text-muted-foreground block text-xs"
                  >Ends</span>
                  <span
                  >{formatDateTime(event.ends_at)}</span>
                </div>
              )}
            </div>
            {event.all_day && (
              <Badge variant="outline" className="text-xs"
              >All day</Badge>
            )}
          </div>

          {/* Source */}
          <div>
            <h5 className="text-sm font-medium text-muted-foreground mb-1"
            >Source</h5>
            <p className="text-sm"
            >
              {event.source_table} → {event.source_id}
            </p>
          </div>

          {/* Linked Records */}
          {(event.linked_cell_id || event.linked_campaign_id || event.linked_strategy_id) && (
            <div>
              <h5 className="text-sm font-medium text-muted-foreground mb-2"
              >Linked Records</h5>
              <div className="flex flex-wrap gap-2"
              >
                {event.linked_cell_id && (
                  <Badge variant="secondary" className="cursor-pointer hover:bg-muted"
                  >
                    Cell: {event.linked_cell_id.slice(0, 8)}...
                  </Badge>
                )}
                {event.linked_campaign_id && (
                  <Badge variant="secondary" className="cursor-pointer hover:bg-muted"
                  >
                    Campaign: {event.linked_campaign_id.slice(0, 8)}...
                  </Badge>
                )}
                {event.linked_strategy_id && (
                  <Badge variant="secondary" className="cursor-pointer hover:bg-muted"
                  >
                    Strategy: {event.linked_strategy_id.slice(0, 8)}...
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Owner */}
          {event.owner_id && (
            <div>
              <h5 className="text-sm font-medium text-muted-foreground mb-1"
              >Owner</h5>
              <p className="text-sm"
              >{event.owner_id}</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
