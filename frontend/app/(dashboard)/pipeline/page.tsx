import { supabaseAdmin } from '@/lib/supabase/admin'
import PipelineShell from './_components/PipelineShell'

export const dynamic = 'force-dynamic'

interface PipelineClient {
  id: string
  client_code: string
  name: string
  status: string
  stage: string | null
  approval_status: string | null
  workflow_metrics: Record<string, unknown> | null
  last_intake_at: string | null
}

export default async function PipelinePage() {
  const { data: clients, error } = await supabaseAdmin
    .from('clients')
    .select('id, client_code, name, status, stage, approval_status, workflow_metrics, last_intake_at')
    .neq('status', 'churned')
    .order('last_intake_at', { ascending: false })

  if (error) {
    console.error('Error fetching pipeline clients:', error)
  }

  const rows: PipelineClient[] = clients || []

  return (
    <PipelineShell clients={rows} />
  )
}
