import { supabaseAdmin } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import CellsGrid from './CellsGrid'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ client_code: string }>
}

export default async function CellsPage({ params }: PageProps) {
  const { client_code } = await params

  const { data: clientData, error: clientError } = await supabaseAdmin
    .from('clients')
    .select('id, client_code')
    .eq('client_code', client_code.toUpperCase())
    .single()

  if (clientError || !clientData) {
    notFound()
  }

  const { data: cellsData } = await supabaseAdmin
    .from('campaign_cells')
    .select('*')
    .eq('client_id', clientData.id)
    .order('created_at', { ascending: false })

  return (
    <CellsGrid
      initialCells={cellsData || []}
      clientId={clientData.id}
      clientCode={clientData.client_code}
    />
  )
}
