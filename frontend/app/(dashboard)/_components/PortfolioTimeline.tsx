import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getAllProjectEvents } from '@/lib/projects/selectors'
import { sortForList } from '@/lib/projects/selectors'
import type { ProjectEvent } from '@/app/types'

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
  })
}

function TimelineItem({ event }: { event: ProjectEvent }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-0">
      <div className="mt-1 w-2 h-2 rounded-full bg-blue-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{event.title}</span>
          <Badge className={statusColors[event.status] || statusColors.pending} variant="secondary">
            {event.status}
          </Badge>
          {event.severity && (
            <Badge className={severityColors[event.severity]} variant="secondary">
              {event.severity}
            </Badge>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
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
    </div>
  )
}

export default async function PortfolioTimeline() {
  const events = await getAllProjectEvents()
  const sorted = sortForList(events).slice(0, 20)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Portfolio Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No events found across clients.
          </div>
        ) : (
          <div className="space-y-0">
            {sorted.map((event) => (
              <TimelineItem key={event.id} event={event} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
