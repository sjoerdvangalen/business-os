import { createClient } from '@/lib/supabase/server'
import type { Client, ClientWithCampaigns, ClientLifecycleStatus } from '@/app/types'

/**
 * Get all clients with optional filtering
 */
export async function getClients(options?: {
  excludeChurned?: boolean
  status?: ClientLifecycleStatus
}): Promise<Client[]> {
  const supabase = await createClient()

  let query = supabase
    .from('clients')
    .select('*')
    .order('name')

  if (options?.excludeChurned) {
    query = query.neq('status', 'churned')
  }

  if (options?.status) {
    query = query.eq('status', options.status)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching clients:', error)
    throw new Error(`Failed to fetch clients: ${error.message}`)
  }

  return data || []
}

/**
 * Get a single client by their unique code (e.g., 'FRTC', 'BETS')
 */
export async function getClientByCode(clientCode: string): Promise<Client | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('code', clientCode.toUpperCase())
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned
      return null
    }
    console.error('Error fetching client by code:', error)
    throw new Error(`Failed to fetch client: ${error.message}`)
  }

  return data
}

/**
 * Get a single client by their UUID
 */
export async function getClientById(clientId: string): Promise<Client | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    console.error('Error fetching client by ID:', error)
    throw new Error(`Failed to fetch client: ${error.message}`)
  }

  return data
}

/**
 * Get client with their campaigns
 */
export async function getClientWithCampaigns(
  clientCode: string
): Promise<ClientWithCampaigns | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('clients')
    .select(`
      *,
      campaigns(*)
    `)
    .eq('code', clientCode.toUpperCase())
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    console.error('Error fetching client with campaigns:', error)
    throw new Error(`Failed to fetch client: ${error.message}`)
  }

  return data
}

/**
 * Update client lifecycle status
 */
export async function updateClientStatus(
  clientId: string,
  status: ClientLifecycleStatus
): Promise<Client> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('clients')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', clientId)
    .select()
    .single()

  if (error) {
    console.error('Error updating client status:', error)
    throw new Error(`Failed to update client status: ${error.message}`)
  }

  return data
}

/**
 * Update client stage (workflow progression)
 */
export async function updateClientStage(
  clientId: string,
  stage: string
): Promise<Client> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('clients')
    .update({ stage, updated_at: new Date().toISOString() })
    .eq('id', clientId)
    .select()
    .single()

  if (error) {
    console.error('Error updating client stage:', error)
    throw new Error(`Failed to update client stage: ${error.message}`)
  }

  return data
}

/**
 * Update client approval status
 */
export async function updateClientApprovalStatus(
  clientId: string,
  approvalStatus: string
): Promise<Client> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('clients')
    .update({
      approval_status: approvalStatus,
      updated_at: new Date().toISOString()
    })
    .eq('id', clientId)
    .select()
    .single()

  if (error) {
    console.error('Error updating client approval status:', error)
    throw new Error(`Failed to update client approval status: ${error.message}`)
  }

  return data
}

/**
 * Get clients by stage
 */
export async function getClientsByStage(stage: string): Promise<Client[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('stage', stage)
    .order('name')

  if (error) {
    console.error('Error fetching clients by stage:', error)
    throw new Error(`Failed to fetch clients: ${error.message}`)
  }

  return data || []
}

/**
 * Get clients needing attention (alerts, issues, etc.)
 */
export async function getClientsNeedingAttention(): Promise<Client[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .or('status.eq.paused,approval_status.eq.internal_review,approval_status.eq.external_iteration')
    .order('name')

  if (error) {
    console.error('Error fetching clients needing attention:', error)
    throw new Error(`Failed to fetch clients: ${error.message}`)
  }

  return data || []
}
