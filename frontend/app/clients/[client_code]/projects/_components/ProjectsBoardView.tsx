'use client'

import type { ProjectEvent } from '@/app/types'
import { groupByStatus } from '@/lib/projects/selectors'

interface ProjectsBoardViewProps {
  events: ProjectEvent[]
  onEventClick: (event: ProjectEvent) => void
}

const columns = [
  { key: 'pending', label: 'Backlog', color: 'border-slate-300' },
  { key: 'in_progress', label: 'In Progress', color: 'border-blue-400' },
  { key: 'review', label: 'Review', color: 'border-amber-400' },
  { key: 'completed', label: 'Done', color: 'border-green-400' },
  { key: 'blocked', label: 'Blocked', color: 'border-red-400' },
] as const

const severityDot: Record<string, string> = {
  info: 'bg-slate-400',
  warning: 'bg-amber-400',
  critical: 'bg-red-500',
}

const statusBg: Record<string, string> = {
  pending: 'bg-slate-50',
  in_progress: 'bg-blue-50',
  review: 'bg-amber-50',
  completed: 'bg-green-50',
  blocked: 'bg-red-50',
}

function formatDate(date: string | null): string {
  if (!date) return '—'
  const d = new Date(date)
  return d.toLocaleDateString('nl-NL', {
    day: '2-digit',
    month: 'short',
  })
}

export default function ProjectsBoardView({ events, onEventClick }: ProjectsBoardViewProps) {
  const grouped = groupByStatus(events)

  return (
    <div className="flex gap-4 overflow-x-auto pb-2"
    >
      {columns.map((col) => {
        const colEvents = grouped[col.key] || []
        return (
          <div
            key={col.key}
            className={`min-w-[280px] flex-1 rounded-lg border-t-4 ${col.color} bg-muted/30`}
          >
            <div className="px-4 py-3 font-medium text-sm flex items-center justify-between">
              <span>{col.label}</span>
              <span className="text-muted-foreground text-xs">{colEvents.length}</span>
            </div>
            <div className="px-2 pb-2 space-y-2">
              {colEvents.map((event) => (
                <button
                  key={event.id}
                  onClick={() => onEventClick(event)}
                  className={`w-full text-left p-3 rounded-md border shadow-sm hover:shadow-md transition-shadow ${statusBg[event.status] || 'bg-white'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-sm line-clamp-2">{event.title}</span>
                    {event.severity && (
                      <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${severityDot[event.severity]}`} />
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="capitalize">{event.project_type.replace(/_/g, ' ')}</span>
                    {event.starts_at && (
                      <>
                        <span>·</span>
                        <span>{formatDate(event.starts_at)}</span>
                      </>
                    )}
                  </div>
                </button>
              ))}
              {colEvents.length === 0 && (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  No items
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
