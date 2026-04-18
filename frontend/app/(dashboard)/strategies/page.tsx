import { supabaseAdmin } from '@/lib/supabase/admin'
import StrategiesShell from './_components/StrategiesShell'

export const dynamic = 'force-dynamic'

interface Strategy {
  id: string
  client_id: string
  version: number
  status: string
  created_at: string
  updated_at: string
}

interface ClientName {
  id: string
  name: string
  client_code: string
}

export default async function StrategiesPage() {
  const { data: strategiesData } = await supabaseAdmin
    .from('gtm_strategies')
    .select('*')
    .order('updated_at', { ascending: false })

  const { data: clientsData } = await supabaseAdmin
    .from('clients')
    .select('id, name, client_code')

  const strategies: Strategy[] = strategiesData || []
  const clients: ClientName[] = clientsData || []

  return (
    <StrategiesShell
      strategies={strategies}
      clients={clients}
    />
  )
}
