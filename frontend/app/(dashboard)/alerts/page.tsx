import { supabaseAdmin } from '@/lib/supabase/admin'
import AlertsShell from './_components/AlertsShell'

export const dynamic = 'force-dynamic'

interface Alert {
  id: string
  alert_type: string
  message: string | null
  severity: string | null
  metadata: Record<string, unknown> | null
  client_id: string | null
  campaign_id: string | null
  resolved_at: string | null
  created_at: string
}

interface ClientName {
  id: string
  name: string
  client_code: string
}

export default async function AlertsPage() {
  const { data: alertsData } = await supabaseAdmin
    .from('alerts')
    .select('*')
    .order('created_at', { ascending: false })

  const alerts: Alert[] = alertsData || []

  const { data: clientsData } = await supabaseAdmin
    .from('clients')
    .select('id, name, client_code')

  const clients: ClientName[] = clientsData || []

  return (
    <AlertsShell
      alerts={alerts}
      clients={clients}
    />
  )
}
