'use client'

import { useState } from 'react'
import type { Client, ProjectEvent } from '@/app/types'
import ViewSwitcher from './ViewSwitcher'
import ProjectFilters from './ProjectFilters'
import ProjectsListView from './ProjectsListView'
import ProjectsBoardView from './ProjectsBoardView'
import ProjectsCalendarView from './ProjectsCalendarView'
import ProjectEventDrawer from './ProjectEventDrawer'
import type { ProjectFilters as FilterState } from '@/lib/projects/selectors'
import { filterEvents, sortForList, sortForCalendar } from '@/lib/projects/selectors'

type ViewType = 'list' | 'board' | 'calendar'

interface ProjectsShellProps {
  client: Client
  events: ProjectEvent[]
  defaultView: string
}

export default function ProjectsShell({ client, events, defaultView }: ProjectsShellProps) {
  const [view, setView] = useState<ViewType>((defaultView as ViewType) || 'list')
  const [selectedEvent, setSelectedEvent] = useState<ProjectEvent | null>(null)
  const [filters, setFilters] = useState<FilterState>({})

  const filteredEvents = filterEvents(events, filters)
  const sortedListEvents = sortForList(filteredEvents)
  const sortedBoardEvents = filteredEvents
  const sortedCalendarEvents = sortForCalendar(filteredEvents)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Projects</h2>
          <p className="text-sm text-muted-foreground">
            {events.length} events derived for {client.name || client.code}
          </p>
        </div>
        <ViewSwitcher current={view} onChange={setView} />
      </div>

      <ProjectFilters filters={filters} onChange={setFilters} events={events} />

      {view === 'list' && (
        <ProjectsListView
          events={sortedListEvents}
          onEventClick={setSelectedEvent}
        />
      )}

      {view === 'board' && (
        <ProjectsBoardView
          events={sortedBoardEvents}
          onEventClick={setSelectedEvent}
        />
      )}

      {view === 'calendar' && (
        <ProjectsCalendarView
          events={sortedCalendarEvents}
          onEventClick={setSelectedEvent}
        />
      )}

      <ProjectEventDrawer
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  )
}
