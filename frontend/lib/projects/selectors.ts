import type { ProjectEvent } from './types'
import {
  mapClientToEvents,
  mapCellsToEvents,
  mapCampaignsToEvents,
  mapMeetingsToEvents,
  mapAlertsToEvents,
  mapStrategyToEvents,
} from './events'
import {
  getClientById,
  getCampaignCells,
  getCampaigns,
  getMeetings,
  getAlerts,
  getLatestStrategy,
  getAllClients,
} from './queries'

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export async function getProjectEvents(clientId: string): Promise<ProjectEvent[]> {
  const [client, cells, campaigns, meetings, alerts, strategy] = await Promise.all([
    getClientById(clientId),
    getCampaignCells(clientId),
    getCampaigns(clientId),
    getMeetings(clientId),
    getAlerts(clientId),
    getLatestStrategy(clientId),
  ])

  const events = [
    ...(client ? mapClientToEvents(client) : []),
    ...mapCellsToEvents(cells),
    ...mapCampaignsToEvents(campaigns),
    ...mapMeetingsToEvents(meetings),
    ...mapAlertsToEvents(alerts),
    ...mapStrategyToEvents(strategy),
  ]

  return events
}

export async function getAllProjectEvents(): Promise<ProjectEvent[]> {
  const clients = await getAllClients()
  const allEvents: ProjectEvent[] = []

  for (const client of clients) {
    const events = await getProjectEvents(client.id)
    allEvents.push(...events)
  }

  return allEvents
}

// ---------------------------------------------------------------------------
// Sorting (view-specific)
// ---------------------------------------------------------------------------

export function sortForCalendar(events: ProjectEvent[]): ProjectEvent[] {
  return [...events].sort((a, b) => {
    const aTime = a.starts_at ? new Date(a.starts_at).getTime() : 0
    const bTime = b.starts_at ? new Date(b.starts_at).getTime() : 0
    return aTime - bTime
  })
}

export function sortForList(events: ProjectEvent[]): ProjectEvent[] {
  return [...events].sort((a, b) => {
    const aTime = a.starts_at ? new Date(a.starts_at).getTime() : 0
    const bTime = b.starts_at ? new Date(b.starts_at).getTime() : 0
    if (bTime !== aTime) return bTime - aTime

    const severityOrder = { critical: 3, warning: 2, info: 1 }
    return (
      (severityOrder[b.severity || 'info'] || 0) -
      (severityOrder[a.severity || 'info'] || 0)
    )
  })
}

// ---------------------------------------------------------------------------
// Grouping (board view)
// ---------------------------------------------------------------------------

export function groupByStatus(events: ProjectEvent[]): Record<string, ProjectEvent[]> {
  const groups: Record<string, ProjectEvent[]> = {
    pending: [],
    in_progress: [],
    review: [],
    completed: [],
    blocked: [],
  }

  for (const event of events) {
    const key = groups[event.status] ? event.status : 'pending'
    groups[key].push(event)
  }

  return groups
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export interface ProjectFilters {
  projectType?: string
  eventType?: string
  status?: string
  severity?: string
  search?: string
}

export function filterEvents(events: ProjectEvent[], filters: ProjectFilters): ProjectEvent[] {
  return events.filter((event) => {
    if (filters.projectType && event.project_type !== filters.projectType) return false
    if (filters.eventType && event.event_type !== filters.eventType) return false
    if (filters.status && event.status !== filters.status) return false
    if (filters.severity && event.severity !== filters.severity) return false
    if (filters.search) {
      const term = filters.search.toLowerCase()
      const text = `${event.title} ${event.description || ''}`.toLowerCase()
      if (!text.includes(term)) return false
    }
    return true
  })
}
