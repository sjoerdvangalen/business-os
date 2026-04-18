import type {
  ProjectEvent,
  ProjectEventStatus,
  SeverityLevel,
} from './types'
import type {
  Client,
  CampaignCell,
  Campaign,
  Meeting,
  Alert,
  GtmStrategy,
} from '@/app/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeId(sourceTable: string, sourceId: string, eventType: string): string {
  return `${sourceTable}:${sourceId}:${eventType}`
}

function today(): string {
  return new Date().toISOString().split('T')[0] + 'T00:00:00.000Z'
}

function severityFromHealth(health: string | null): SeverityLevel {
  if (health === 'CRITICAL') return 'critical'
  if (health === 'WARNING') return 'warning'
  return 'info'
}

function statusFromCellStatus(cellStatus: string): ProjectEventStatus {
  switch (cellStatus) {
    case 'sourcing_pending':
    case 'sourcing_failed':
      return 'pending'
    case 'messaging_revision':
      return 'blocked'
    case 'ready':
    case 'H1_testing':
    case 'F1_testing':
    case 'CTA1_testing':
      return 'in_progress'
    case 'H1_winner':
    case 'F1_winner':
    case 'soft_launch':
      return 'review'
    case 'scaling':
      return 'completed'
    case 'killed':
      return 'blocked'
    default:
      return 'pending'
  }
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

export function mapClientToEvents(client: Client): ProjectEvent[] {
  const events: ProjectEvent[] = []

  // Strategy review events based on approval_status gates
  if (client.approval_status) {
    const approvalGates: Record<string, { title: string; status: ProjectEventStatus }> = {
      draft: { title: 'Strategy draft created', status: 'pending' },
      synthesized: { title: 'Strategy synthesized', status: 'pending' },
      internal_review: { title: 'Internal strategy review', status: 'in_progress' },
      internal_approved: { title: 'Strategy internally approved', status: 'completed' },
      external_sent: { title: 'Strategy sent to client', status: 'in_progress' },
      external_iteration: { title: 'Strategy iteration with client', status: 'in_progress' },
      external_approved: { title: 'Strategy externally approved', status: 'completed' },
    }

    const gate = approvalGates[client.approval_status]
    if (gate) {
      events.push({
        id: makeId('clients', client.id, `approval:${client.approval_status}`),
        client_id: client.id,
        project_type: 'strategy_review',
        event_type: 'approval',
        title: gate.title,
        starts_at: client.created_at,
        ends_at: null,
        all_day: true,
        status: gate.status,
        source_table: 'clients',
        source_id: client.id,
      })
    }
  }

  // Milestone: client onboarding / lifecycle stage transitions
  if (client.stage) {
    const stageEvents: Record<string, string> = {
      intake: 'Client intake started',
      internal_approval: 'Internal approval stage',
      external_sent: 'External review sent',
      external_iteration: 'External iteration',
      external_approved: 'Strategy approved — ready for execution',
      h1: 'H1 testing phase',
      f1: 'F1 testing phase',
      cta1: 'CTA1 testing phase',
      scaling: 'Client scaling',
    }

    const stageTitle = stageEvents[client.stage]
    if (stageTitle) {
      events.push({
        id: makeId('clients', client.id, `stage:${client.stage}`),
        client_id: client.id,
        project_type: 'onboarding',
        event_type: 'milestone',
        title: stageTitle,
        starts_at: client.created_at,
        ends_at: null,
        all_day: true,
        status:
          client.stage === 'scaling'
            ? 'completed'
            : client.stage === 'external_approved'
              ? 'completed'
              : 'in_progress',
        source_table: 'clients',
        source_id: client.id,
      })
    }
  }

  return events
}

export function mapCellsToEvents(cells: CampaignCell[]): ProjectEvent[] {
  const events: ProjectEvent[] = []

  for (const cell of cells) {
    const baseEvent = {
      client_id: cell.client_id,
      linked_cell_id: cell.id,
      source_table: 'campaign_cells',
      source_id: cell.id,
    }

    // Launch window event when cell reaches ready or testing
    if (cell.status === 'ready' || cell.status.startsWith('H1') || cell.status.startsWith('F1') || cell.status.startsWith('CTA1')) {
      events.push({
        ...baseEvent,
        id: makeId('campaign_cells', cell.id, 'launch_window'),
        project_type: 'launch_window',
        event_type: 'launch',
        title: `Launch window: ${cell.cell_code || cell.cell_slug || 'Unnamed cell'}`,
        description: `Cell status: ${cell.status}`,
        starts_at: cell.updated_at,
        ends_at: null,
        all_day: true,
        status: statusFromCellStatus(cell.status),
        source_table: 'campaign_cells',
        source_id: cell.id,
      })
    }

    // Test phase events
    if (cell.status === 'H1_testing' || cell.status === 'H1_winner') {
      events.push({
        ...baseEvent,
        id: makeId('campaign_cells', cell.id, 'test:h1'),
        project_type: 'test_phase',
        event_type: 'test_window',
        title: `H1 Test: ${cell.cell_code || cell.cell_slug || 'Unnamed cell'}`,
        description: 'Hook variant test phase (300 delivered/variant)',
        starts_at: cell.updated_at,
        ends_at: null,
        all_day: true,
        status: cell.status === 'H1_winner' ? 'completed' : 'in_progress',
        source_table: 'campaign_cells',
        source_id: cell.id,
      })
    }

    if (cell.status === 'F1_testing' || cell.status === 'F1_winner') {
      events.push({
        ...baseEvent,
        id: makeId('campaign_cells', cell.id, 'test:f1'),
        project_type: 'test_phase',
        event_type: 'test_window',
        title: `F1 Test: ${cell.cell_code || cell.cell_slug || 'Unnamed cell'}`,
        description: 'Offer variant + framework test phase (500 delivered/variant)',
        starts_at: cell.updated_at,
        ends_at: null,
        all_day: true,
        status: cell.status === 'F1_winner' ? 'completed' : 'in_progress',
        source_table: 'campaign_cells',
        source_id: cell.id,
      })
    }

    if (cell.status === 'CTA1_testing') {
      events.push({
        ...baseEvent,
        id: makeId('campaign_cells', cell.id, 'test:cta1'),
        project_type: 'test_phase',
        event_type: 'test_window',
        title: `CTA1 Test: ${cell.cell_code || cell.cell_slug || 'Unnamed cell'}`,
        description: 'CTA variant test phase (300 delivered/variant)',
        starts_at: cell.updated_at,
        ends_at: null,
        all_day: true,
        status: 'in_progress',
        source_table: 'campaign_cells',
        source_id: cell.id,
      })
    }

    // Milestone: cell status transitions
    events.push({
      ...baseEvent,
      id: makeId('campaign_cells', cell.id, `status:${cell.status}`),
      project_type: 'launch_window',
      event_type: 'milestone',
      title: `Cell ${cell.status}: ${cell.cell_code || cell.cell_slug || 'Unnamed cell'}`,
      starts_at: cell.updated_at,
      ends_at: null,
      all_day: true,
      status: statusFromCellStatus(cell.status),
      source_table: 'campaign_cells',
      source_id: cell.id,
    })
  }

  return events
}

export function mapCampaignsToEvents(campaigns: Campaign[]): ProjectEvent[] {
  const events: ProjectEvent[] = []

  for (const campaign of campaigns) {
    // Launch event
    events.push({
      id: makeId('campaigns', campaign.id, 'launch'),
      client_id: campaign.client_id,
      project_type: 'launch_window',
      event_type: 'launch',
      title: `Campaign launched: ${campaign.name}`,
      starts_at: campaign.created_at,
      ends_at: null,
      all_day: true,
      status: campaign.status === 'active' ? 'completed' : 'pending',
      source_table: 'campaigns',
      source_id: campaign.id,
      linked_campaign_id: campaign.id,
    })

    // Health alert (mapped to infra_alert, NOT health_alert event_type)
    if (campaign.health_status === 'WARNING' || campaign.health_status === 'CRITICAL') {
      events.push({
        id: makeId('campaigns', campaign.id, 'health'),
        client_id: campaign.client_id,
        project_type: 'infra_remediation',
        event_type: 'infra_alert',
        title: `Campaign health ${campaign.health_status}: ${campaign.name}`,
        description: `Campaign requires attention`,
        starts_at: campaign.updated_at || today(),
        ends_at: null,
        all_day: true,
        status: campaign.health_status === 'CRITICAL' ? 'blocked' : 'in_progress',
        severity: severityFromHealth(campaign.health_status),
        source_table: 'campaigns',
        source_id: campaign.id,
        linked_campaign_id: campaign.id,
      })
    }
  }

  return events
}

export function mapMeetingsToEvents(meetings: Meeting[]): ProjectEvent[] {
  return meetings.map((meeting) => ({
    id: makeId('meetings', meeting.id, 'meeting'),
    client_id: meeting.client_id || '',
    project_type: 'meeting_block',
    event_type: 'meeting',
    title: meeting.title || 'Meeting',
    description: meeting.description || undefined,
    starts_at: meeting.start_time,
    ends_at: meeting.end_time,
    all_day: false,
    status: meeting.status === 'completed' ? 'completed' : meeting.status === 'cancelled' ? 'blocked' : 'pending',
    source_table: 'meetings',
    source_id: meeting.id,
  }))
}

export function mapAlertsToEvents(alerts: Alert[]): ProjectEvent[] {
  return alerts.map((alert) => {
    const isBlocker = alert.alert_type?.toLowerCase().includes('blocker')
    const isCritical =
      alert.alert_type?.toLowerCase().includes('critical') ||
      alert.alert_type?.toLowerCase().includes('disconnected') ||
      alert.severity === 'critical'

    return {
      id: makeId('alerts', alert.id, isBlocker ? 'blocker' : 'alert'),
      client_id: alert.client_id || '',
      project_type: 'infra_remediation',
      event_type: isBlocker ? 'blocker' : 'infra_alert',
      title: `${alert.alert_type || 'Alert'}`,
      description: alert.message || undefined,
      starts_at: alert.created_at,
      ends_at: null,
      all_day: true,
      status: isBlocker ? 'blocked' : isCritical ? 'in_progress' : 'pending',
      severity:
        alert.severity === 'critical'
          ? 'critical'
          : alert.severity === 'warning'
            ? 'warning'
            : isBlocker
              ? 'warning'
              : 'info',
      source_table: 'alerts',
      source_id: alert.id,
    }
  })
}

export function mapStrategyToEvents(strategy: GtmStrategy | null): ProjectEvent[] {
  if (!strategy) return []

  const events: ProjectEvent[] = []

  // Strategy approval gate events
  const statusTitle: Record<string, string> = {
    draft: 'Strategy draft',
    synthesized: 'Strategy synthesized',
    internal_review: 'Strategy internal review',
    internal_approved: 'Strategy internally approved',
    external_sent: 'Strategy sent to client',
    external_iteration: 'Strategy iteration',
    external_approved: 'Strategy approved — execution ready',
  }

  if (strategy.status) {
    events.push({
      id: makeId('gtm_strategies', strategy.id, `status:${strategy.status}`),
      client_id: strategy.client_id,
      project_type: 'strategy_review',
      event_type: 'approval',
      title: statusTitle[strategy.status] || `Strategy: ${strategy.status}`,
      starts_at: strategy.updated_at || strategy.created_at,
      ends_at: null,
      all_day: true,
      status:
        strategy.status === 'external_approved'
          ? 'completed'
          : strategy.status === 'internal_approved'
            ? 'completed'
            : 'in_progress',
      source_table: 'gtm_strategies',
      source_id: strategy.id,
      linked_strategy_id: strategy.id,
    })
  }

  return events
}
