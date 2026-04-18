import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Client, CampaignCell, Campaign, Meeting, Alert, GtmStrategy } from '@/app/types'

export async function getClientById(clientId: string): Promise<Client | null> {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`Failed to fetch client: ${error.message}`)
  }
  return data
}

export async function getCampaignCells(clientId: string): Promise<CampaignCell[]> {
  const { data, error } = await supabaseAdmin
    .from('campaign_cells')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch campaign cells: ${error.message}`)
  }
  return data || []
}

export async function getCampaigns(clientId: string): Promise<Campaign[]> {
  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch campaigns: ${error.message}`)
  }
  return data || []
}

export async function getMeetings(clientId: string): Promise<Meeting[]> {
  const { data, error } = await supabaseAdmin
    .from('meetings')
    .select('*')
    .eq('client_id', clientId)
    .order('start_time', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch meetings: ${error.message}`)
  }
  return data || []
}

export async function getAlerts(clientId: string): Promise<Alert[]> {
  const { data, error } = await supabaseAdmin
    .from('alerts')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch alerts: ${error.message}`)
  }
  return data || []
}

export async function getLatestStrategy(clientId: string): Promise<GtmStrategy | null> {
  const { data, error } = await supabaseAdmin
    .from('gtm_strategies')
    .select('*')
    .eq('client_id', clientId)
    .order('version', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`Failed to fetch strategy: ${error.message}`)
  }
  return data
}

export async function getAllClients(): Promise<Client[]> {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('*')
    .order('name')

  if (error) {
    throw new Error(`Failed to fetch clients: ${error.message}`)
  }
  return data || []
}
