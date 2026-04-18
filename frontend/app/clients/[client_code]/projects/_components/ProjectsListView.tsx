'use client'

import type { ProjectEvent } from '@/app/types'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface ProjectsListViewProps {
  events: ProjectEvent[]
  onEventClick: (event: ProjectEvent) => void
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

function formatDate(date: string | null): string {
  if (!date) return '—'
  const d = new Date(date)
  return d.toLocaleDateString('nl-NL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default function ProjectsListView({ events, onEventClick }: ProjectsListViewProps) {
  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <p>No events match the current filters.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Events ({events.length})</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {events.map((event) => (
            <button
              key={event.id}
              onClick={() => onEventClick(event)}
              className="w-full text-left px-6 py-4 hover:bg-muted/50 transition-colors flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium truncate">{event.title}</span>
                  <Badge className={statusColors[event.status] || statusColors.pending} variant="secondary">
                    {event.status}
                  </Badge>
                  {event.severity && (
                    <Badge className={severityColors[event.severity]} variant="secondary">
                      {event.severity}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="capitalize">{event.project_type.replace(/_/g, ' ')}</span>
                  <span>·</span>
                  <span className="capitalize">{event.event_type.replace(/_/g, ' ')}</span>
                  {event.starts_at && (
                    <>
                      <span>·</span>
                      <span>{formatDate(event.starts_at)}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right text-sm text-muted-foreground shrink-0">
                {event.linked_cell_id && (
                  <span className="block text-xs">Cell</span>
                )}
                {event.linked_campaign_id && (
                  <span className="block text-xs">Campaign</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
