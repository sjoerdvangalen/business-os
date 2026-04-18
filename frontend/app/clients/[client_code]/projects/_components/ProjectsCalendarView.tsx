'use client'

import { useMemo } from 'react'
import type { ProjectEvent } from '@/app/types'
import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enUS } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'

interface ProjectsCalendarViewProps {
  events: ProjectEvent[]
  onEventClick: (event: ProjectEvent) => void
}

const locales = {
  'en-US': enUS,
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
})

const eventTypeColors: Record<string, string> = {
  milestone: '#3b82f6',
  approval: '#10b981',
  launch: '#8b5cf6',
  test_window: '#f59e0b',
  meeting: '#06b6d4',
  infra_alert: '#ef4444',
  blocker: '#dc2626',
  overdue: '#f97316',
}

export default function ProjectsCalendarView({ events, onEventClick }: ProjectsCalendarViewProps) {
  const calendarEvents = useMemo(() => {
    return events
      .filter((e) => e.starts_at)
      .map((e) => ({
        id: e.id,
        title: e.title,
        start: new Date(e.starts_at!),
        end: e.ends_at ? new Date(e.ends_at) : new Date(e.starts_at!),
        allDay: e.all_day,
        resource: e,
      }))
  }, [events])

  const eventStyleGetter = (event: { resource: ProjectEvent }) => {
    const color = eventTypeColors[event.resource.event_type] || '#64748b'
    return {
      style: {
        backgroundColor: color,
        borderRadius: '4px',
        opacity: 0.9,
        color: '#fff',
        border: '0',
        fontSize: '12px',
      },
    }
  }

  return (
    <div className="h-[700px] bg-white rounded-lg border shadow-sm p-4">
      <Calendar
        localizer={localizer}
        events={calendarEvents}
        startAccessor="start"
        endAccessor="end"
        allDayAccessor="allDay"
        eventPropGetter={eventStyleGetter}
        onSelectEvent={(calEvent) => {
          onEventClick(calEvent.resource as ProjectEvent)
        }}
        views={['month', 'week', 'day']}
        defaultView="month"
        popup
      />
    </div>
  )
}
