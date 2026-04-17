import { createClient } from '@/lib/supabase/server'
import type {
  CampaignCell,
  CampaignCellStatus,
  CampaignCellBrief,
  GtmStrategy
} from '@/app/types'

/**
 * Get all campaign cells with optional filtering
 */
export async function getCampaignCells(options?: {
  clientId?: string
  strategyId?: string
  status?: CampaignCellStatus
  solutionKey?: string
  icpKey?: string
  verticalKey?: string
  personaKey?: string
}): Promise<CampaignCell[]> {
  const supabase = await createClient()

  let query = supabase
    .from('campaign_cells')
    .select('*')
    .order('cell_code')

  if (options?.clientId) {
    query = query.eq('client_id', options.clientId)
  }

  if (options?.strategyId) {
    query = query.eq('strategy_id', options.strategyId)
  }

  if (options?.status) {
    query = query.eq('status', options.status)
  }

  if (options?.solutionKey) {
    query = query.eq('solution_key', options.solutionKey)
  }

  if (options?.icpKey) {
    query = query.eq('icp_key', options.icpKey)
  }

  if (options?.verticalKey) {
    query = query.eq('vertical_key', options.verticalKey)
  }

  if (options?.personaKey) {
    query = query.eq('persona_key', options.personaKey)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching campaign cells:', error)
    throw new Error(`Failed to fetch campaign cells: ${error.message}`)
  }

  return data || []
}

/**
 * Get cells for a specific client by client code
 */
export async function getCellsByClientCode(clientCode: string): Promise<CampaignCell[]> {
  const supabase = await createClient()

  // First get the client ID from code
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id')
    .eq('client_code', clientCode.toUpperCase())
    .single()

  if (clientError) {
    console.error('Error fetching client:', clientError)
    throw new Error(`Failed to fetch client: ${clientError.message}`)
  }

  if (!client) {
    return []
  }

  const { data, error } = await supabase
    .from('campaign_cells')
    .select('*')
    .eq('client_id', client.id)
    .order('cell_code')

  if (error) {
    console.error('Error fetching cells by client:', error)
    throw new Error(`Failed to fetch campaign cells: ${error.message}`)
  }

  return data || []
}

/**
 * Get cells for a specific client by client ID
 */
export async function getCellsByClientId(clientId: string): Promise<CampaignCell[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('campaign_cells')
    .select('*')
    .eq('client_id', clientId)
    .order('cell_code')

  if (error) {
    console.error('Error fetching cells by client ID:', error)
    throw new Error(`Failed to fetch campaign cells: ${error.message}`)
  }

  return data || []
}

/**
 * Get a single campaign cell by ID
 */
export async function getCampaignCellById(cellId: string): Promise<CampaignCell | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('campaign_cells')
    .select('*')
    .eq('id', cellId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    console.error('Error fetching campaign cell:', error)
    throw new Error(`Failed to fetch campaign cell: ${error.message}`)
  }

  return data
}

/**
 * Get a campaign cell by its unique cell code
 */
export async function getCampaignCellByCode(cellCode: string): Promise<CampaignCell | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('campaign_cells')
    .select('*')
    .eq('cell_code', cellCode)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    console.error('Error fetching campaign cell by code:', error)
    throw new Error(`Failed to fetch campaign cell: ${error.message}`)
  }

  return data
}

/**
 * Get cells by status for a client
 */
export async function getCellsByStatus(
  clientId: string,
  status: CampaignCellStatus
): Promise<CampaignCell[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('campaign_cells')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', status)
    .order('cell_code')

  if (error) {
    console.error('Error fetching cells by status:', error)
    throw new Error(`Failed to fetch campaign cells: ${error.message}`)
  }

  return data || []
}

/**
 * Update campaign cell status
 */
export async function updateCampaignCellStatus(
  cellId: string,
  status: CampaignCellStatus
): Promise<CampaignCell> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('campaign_cells')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', cellId)
    .select()
    .single()

  if (error) {
    console.error('Error updating campaign cell status:', error)
    throw new Error(`Failed to update campaign cell: ${error.message}`)
  }

  return data
}

/**
 * Update campaign cell brief (messaging and enrichment data)
 */
export async function updateCampaignCellBrief(
  cellId: string,
  brief: CampaignCellBrief
): Promise<CampaignCell> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('campaign_cells')
    .update({
      brief,
      updated_at: new Date().toISOString()
    })
    .eq('id', cellId)
    .select()
    .single()

  if (error) {
    console.error('Error updating campaign cell brief:', error)
    throw new Error(`Failed to update campaign cell: ${error.message}`)
  }

  return data
}

/**
 * Get cells with strategy context (includes snapshot data)
 */
export async function getCellsWithStrategyContext(
  clientId: string
): Promise<Array<CampaignCell & { strategy?: GtmStrategy }>> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('campaign_cells')
    .select(`
      *,
      strategy:gtm_strategies(*)
    `)
    .eq('client_id', clientId)
    .order('cell_code')

  if (error) {
    console.error('Error fetching cells with strategy:', error)
    throw new Error(`Failed to fetch campaign cells: ${error.message}`)
  }

  return data || []
}

/**
 * Get cell counts by status for a client
 */
export async function getCellStatusCounts(clientId: string): Promise<{
  total: number
  sourcing_pending: number
  sourcing_failed: number
  messaging_revision: number
  ready: number
  H1_testing: number
  H1_winner: number
  F1_testing: number
  F1_winner: number
  CTA1_testing: number
  soft_launch: number
  scaling: number
  killed: number
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('campaign_cells')
    .select('status')
    .eq('client_id', clientId)

  if (error) {
    console.error('Error fetching cell counts:', error)
    throw new Error(`Failed to fetch cell counts: ${error.message}`)
  }

  const cells = data || []
  const counts = {
    total: cells.length,
    sourcing_pending: 0,
    sourcing_failed: 0,
    messaging_revision: 0,
    ready: 0,
    H1_testing: 0,
    H1_winner: 0,
    F1_testing: 0,
    F1_winner: 0,
    CTA1_testing: 0,
    soft_launch: 0,
    scaling: 0,
    killed: 0,
  }

  for (const cell of cells) {
    const status = cell.status as CampaignCellStatus
    if (status in counts) {
      counts[status as keyof typeof counts]++
    }
  }

  return counts
}

/**
 * Get cells ready for execution (status = ready, H1_testing, etc.)
 */
export async function getCellsReadyForExecution(clientId: string): Promise<CampaignCell[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('campaign_cells')
    .select('*')
    .eq('client_id', clientId)
    .in('status', ['ready', 'H1_testing', 'H1_winner', 'F1_testing', 'F1_winner', 'CTA1_testing'])
    .order('cell_code')

  if (error) {
    console.error('Error fetching cells for execution:', error)
    throw new Error(`Failed to fetch campaign cells: ${error.message}`)
  }

  return data || []
}

/**
 * Create campaign cells from strategy matrix seed
 * Note: This is typically done by the gtm-campaign-cell-seed edge function
 */
export async function createCampaignCells(
  cells: Omit<CampaignCell, 'id' | 'created_at' | 'updated_at'>[]
): Promise<CampaignCell[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('campaign_cells')
    .insert(cells)
    .select()

  if (error) {
    console.error('Error creating campaign cells:', error)
    throw new Error(`Failed to create campaign cells: ${error.message}`)
  }

  return data || []
}
