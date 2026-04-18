import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Domain, EmailInbox, EmailInboxStatus } from '@/app/types'

// ============================================================================
// DOMAIN QUERIES
// ============================================================================

/**
 * Get all domains with optional filtering
 */
export async function getDomains(options?: {
  clientId?: string
  healthy?: boolean
}): Promise<Domain[]> {
  let query = supabaseAdmin
    .from('domains')
    .select('*')
    .order('domain')

  if (options?.clientId) {
    query = query.eq('client_id', options.clientId)
  }

  if (options?.healthy) {
    query = query
      .eq('spf_status', 'valid')
      .eq('dkim_status', 'valid')
      .eq('dmarc_status', 'valid')
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching domains:', error)
    throw new Error(`Failed to fetch domains: ${error.message}`)
  }

  return data || []
}

/**
 * Get domains for a specific client by client code
 */
export async function getDomainsByClientCode(clientCode: string): Promise<Domain[]> {
  // First get the client ID from code
  const { data: client, error: clientError } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('code', clientCode.toUpperCase())
    .single()

  if (clientError) {
    console.error('Error fetching client:', clientError)
    throw new Error(`Failed to fetch client: ${clientError.message}`)
  }

  if (!client) {
    return []
  }

  const { data, error } = await supabaseAdmin
    .from('domains')
    .select('*')
    .eq('client_id', client.id)
    .order('domain')

  if (error) {
    console.error('Error fetching domains by client:', error)
    throw new Error(`Failed to fetch domains: ${error.message}`)
  }

  return data || []
}

/**
 * Get domains for a specific client by client ID
 */
export async function getDomainsByClientId(clientId: string): Promise<Domain[]> {
  const { data, error } = await supabaseAdmin
    .from('domains')
    .select('*')
    .eq('client_id', clientId)
    .order('domain')

  if (error) {
    console.error('Error fetching domains by client ID:', error)
    throw new Error(`Failed to fetch domains: ${error.message}`)
  }

  return data || []
}

/**
 * Get a single domain by ID
 */
export async function getDomainById(domainId: string): Promise<Domain | null> {
  const { data, error } = await supabaseAdmin
    .from('domains')
    .select('*')
    .eq('id', domainId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    console.error('Error fetching domain:', error)
    throw new Error(`Failed to fetch domain: ${error.message}`)
  }

  return data
}

/**
 * Get domain by domain name
 */
export async function getDomainByName(domainName: string): Promise<Domain | null> {
  const { data, error } = await supabaseAdmin
    .from('domains')
    .select('*')
    .eq('domain', domainName.toLowerCase())
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    console.error('Error fetching domain by name:', error)
    throw new Error(`Failed to fetch domain: ${error.message}`)
  }

  return data
}

/**
 * Get domains with DNS issues
 */
export async function getDomainsWithIssues(): Promise<Domain[]> {
  const { data, error } = await supabaseAdmin
    .from('domains')
    .select('*')
    .or('spf_status.eq.invalid,dkim_status.eq.invalid,dmarc_status.eq.invalid')
    .order('domain')

  if (error) {
    console.error('Error fetching domains with issues:', error)
    throw new Error(`Failed to fetch domains: ${error.message}`)
  }

  return data || []
}

/**
 * Get domain health summary
 */
export async function getDomainHealthSummary(clientId?: string): Promise<{
  total: number
  healthy: number
  spfIssues: number
  dkimIssues: number
  dmarcIssues: number
  averageHealthScore: number
}> {
  let query = supabaseAdmin.from('domains').select('*')

  if (clientId) {
    query = query.eq('client_id', clientId)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching domain summary:', error)
    throw new Error(`Failed to fetch domain summary: ${error.message}`)
  }

  const domains = data || []
  const total = domains.length

  if (total === 0) {
    return {
      total: 0,
      healthy: 0,
      spfIssues: 0,
      dkimIssues: 0,
      dmarcIssues: 0,
      averageHealthScore: 0,
    }
  }

  const healthy = domains.filter(
    (d) => d.spf_status === 'valid' && d.dkim_status === 'valid' && d.dmarc_status === 'valid'
  ).length

  const spfIssues = domains.filter((d) => d.spf_status !== 'valid').length
  const dkimIssues = domains.filter((d) => d.dkim_status !== 'valid').length
  const dmarcIssues = domains.filter((d) => d.dmarc_status !== 'valid').length

  const averageHealthScore =
    domains.reduce((sum, d) => sum + (d.health_score || 0), 0) / total

  return {
    total,
    healthy,
    spfIssues,
    dkimIssues,
    dmarcIssues,
    averageHealthScore: Math.round(averageHealthScore),
  }
}

// ============================================================================
// EMAIL INBOX QUERIES
// ============================================================================

/**
 * Get all email inboxes with optional filtering
 */
export async function getEmailInboxes(options?: {
  clientId?: string
  domainId?: string
  status?: EmailInboxStatus
  active?: boolean
}): Promise<EmailInbox[]> {
  let query = supabaseAdmin
    .from('email_inboxes')
    .select('*')
    .order('email')

  if (options?.clientId) {
    query = query.eq('client_id', options.clientId)
  }

  if (options?.domainId) {
    query = query.eq('domain_id', options.domainId)
  }

  if (options?.status) {
    query = query.eq('status', options.status)
  }

  if (options?.active) {
    query = query.in('status', ['active', 'connected'])
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching email inboxes:', error)
    throw new Error(`Failed to fetch email inboxes: ${error.message}`)
  }

  return data || []
}

/**
 * Get email inboxes for a specific client by client code
 */
export async function getEmailInboxesByClientCode(clientCode: string): Promise<EmailInbox[]> {
  // First get the client ID from code
  const { data: client, error: clientError } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('code', clientCode.toUpperCase())
    .single()

  if (clientError) {
    console.error('Error fetching client:', clientError)
    throw new Error(`Failed to fetch client: ${clientError.message}`)
  }

  if (!client) {
    return []
  }

  const { data, error } = await supabaseAdmin
    .from('email_inboxes')
    .select('*')
    .eq('client_id', client.id)
    .order('email')

  if (error) {
    console.error('Error fetching email inboxes by client:', error)
    throw new Error(`Failed to fetch email inboxes: ${error.message}`)
  }

  return data || []
}

/**
 * Get email inboxes for a specific client by client ID
 */
export async function getEmailInboxesByClientId(clientId: string): Promise<EmailInbox[]> {
  const { data, error } = await supabaseAdmin
    .from('email_inboxes')
    .select('*')
    .eq('client_id', clientId)
    .order('email')

  if (error) {
    console.error('Error fetching email inboxes by client ID:', error)
    throw new Error(`Failed to fetch email inboxes: ${error.message}`)
  }

  return data || []
}

/**
 * Get a single email inbox by ID
 */
export async function getEmailInboxById(inboxId: string): Promise<EmailInbox | null> {
  const { data, error } = await supabaseAdmin
    .from('email_inboxes')
    .select('*')
    .eq('id', inboxId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    console.error('Error fetching email inbox:', error)
    throw new Error(`Failed to fetch email inbox: ${error.message}`)
  }

  return data
}

/**
 * Get email inbox by email address
 */
export async function getEmailInboxByAddress(email: string): Promise<EmailInbox | null> {
  const { data, error } = await supabaseAdmin
    .from('email_inboxes')
    .select('*')
    .eq('email', email.toLowerCase())
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    console.error('Error fetching email inbox by address:', error)
    throw new Error(`Failed to fetch email inbox: ${error.message}`)
  }

  return data
}

/**
 * Get inboxes with connection issues
 */
export async function getInboxesWithIssues(): Promise<EmailInbox[]> {
  const { data, error } = await supabaseAdmin
    .from('email_inboxes')
    .select('*')
    .in('status', ['disconnected', 'bouncing', 'disabled'])
    .order('email')

  if (error) {
    console.error('Error fetching inboxes with issues:', error)
    throw new Error(`Failed to fetch email inboxes: ${error.message}`)
  }

  return data || []
}

/**
 * Get inboxes ready for campaigns (active with good warmup)
 */
export async function getReadyInboxes(minWarmupScore: number = 70): Promise<EmailInbox[]> {
  const { data, error } = await supabaseAdmin
    .from('email_inboxes')
    .select('*')
    .in('status', ['active', 'connected'])
    .gte('warmup_score', minWarmupScore)
    .order('warmup_score', { ascending: false })

  if (error) {
    console.error('Error fetching ready inboxes:', error)
    throw new Error(`Failed to fetch email inboxes: ${error.message}`)
  }

  return data || []
}

/**
 * Get email inbox summary for a client
 */
export async function getEmailInboxSummary(clientId?: string): Promise<{
  total: number
  active: number
  disconnected: number
  bouncing: number
  averageWarmupScore: number
  totalSentToday: number
}> {
  let query = supabaseAdmin.from('email_inboxes').select('*')

  if (clientId) {
    query = query.eq('client_id', clientId)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching inbox summary:', error)
    throw new Error(`Failed to fetch inbox summary: ${error.message}`)
  }

  const inboxes = data || []
  const total = inboxes.length

  if (total === 0) {
    return {
      total: 0,
      active: 0,
      disconnected: 0,
      bouncing: 0,
      averageWarmupScore: 0,
      totalSentToday: 0,
    }
  }

  const active = inboxes.filter((i) => ['active', 'connected'].includes(i.status)).length
  const disconnected = inboxes.filter((i) => i.status === 'disconnected').length
  const bouncing = inboxes.filter((i) => i.status === 'bouncing').length

  const averageWarmupScore =
    inboxes.reduce((sum, i) => sum + (i.warmup_score || 0), 0) / total

  const totalSentToday = inboxes.reduce((sum, i) => sum + (i.sent_today || 0), 0)

  return {
    total,
    active,
    disconnected,
    bouncing,
    averageWarmupScore: Math.round(averageWarmupScore),
    totalSentToday,
  }
}

/**
 * Update email inbox status
 */
export async function updateEmailInboxStatus(
  inboxId: string,
  status: EmailInboxStatus
): Promise<EmailInbox> {
  const { data, error } = await supabaseAdmin
    .from('email_inboxes')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', inboxId)
    .select()
    .single()

  if (error) {
    console.error('Error updating email inbox status:', error)
    throw new Error(`Failed to update email inbox: ${error.message}`)
  }

  return data
}

/**
 * Update email inbox warmup score
 */
export async function updateEmailInboxWarmupScore(
  inboxId: string,
  warmupScore: number
): Promise<EmailInbox> {
  const { data, error } = await supabaseAdmin
    .from('email_inboxes')
    .update({
      warmup_score: warmupScore,
      updated_at: new Date().toISOString(),
    })
    .eq('id', inboxId)
    .select()
    .single()

  if (error) {
    console.error('Error updating email inbox warmup score:', error)
    throw new Error(`Failed to update email inbox: ${error.message}`)
  }

  return data
}

// ============================================================================
// INFRASTRUCTURE SUMMARY
// ============================================================================

/**
 * Get complete infrastructure summary for a client
 */
export async function getInfrastructureSummary(clientId: string): Promise<{
  domains: {
    total: number
    healthy: number
    withIssues: number
  }
  inboxes: {
    total: number
    active: number
    disconnected: number
    averageWarmupScore: number
  }
  overallHealth: 'healthy' | 'warning' | 'critical' | 'unknown'
}> {
  const [domainSummary, inboxSummary] = await Promise.all([
    getDomainHealthSummary(clientId),
    getEmailInboxSummary(clientId),
  ])

  const domainIssues = domainSummary.spfIssues + domainSummary.dkimIssues + domainSummary.dmarcIssues

  let overallHealth: 'healthy' | 'warning' | 'critical' | 'unknown' = 'unknown'

  if (domainSummary.total === 0 && inboxSummary.total === 0) {
    overallHealth = 'unknown'
  } else if (domainIssues === 0 && inboxSummary.disconnected === 0 && inboxSummary.bouncing === 0) {
    overallHealth = 'healthy'
  } else if (domainIssues > 2 || inboxSummary.disconnected > 2 || inboxSummary.bouncing > 0) {
    overallHealth = 'critical'
  } else {
    overallHealth = 'warning'
  }

  return {
    domains: {
      total: domainSummary.total,
      healthy: domainSummary.healthy,
      withIssues: domainIssues,
    },
    inboxes: {
      total: inboxSummary.total,
      active: inboxSummary.active,
      disconnected: inboxSummary.disconnected,
      averageWarmupScore: inboxSummary.averageWarmupScore,
    },
    overallHealth,
  }
}
