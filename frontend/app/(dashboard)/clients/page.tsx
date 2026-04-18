import { Suspense } from 'react'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import ClientsList from './components/ClientsList'
import ClientsSkeleton from './components/ClientsSkeleton'

export const dynamic = 'force-dynamic'

interface Client {
  id: string
  client_code: string
  name: string
  status: string
  stage: string
  campaign_count: number
  created_at: string
}

async function getClients(): Promise<Client[]> {
  const { data: clients, error } = await supabaseAdmin
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Supabase query error: ${error.message} (${error.code})`)
  }

  if (!clients || clients.length === 0) {
    return []
  }

  // Get campaign counts separately
  const { data: campaigns } = await supabaseAdmin
    .from('campaigns')
    .select('client_id')

  const campaignCounts: Record<string, number> = {}
  if (campaigns) {
    for (const c of campaigns) {
      campaignCounts[c.client_id] = (campaignCounts[c.client_id] || 0) + 1
    }
  }

  return clients.map((client: any) => ({
    id: client.id,
    client_code: client.client_code,
    name: client.name,
    status: client.status,
    stage: client.stage,
    campaign_count: campaignCounts[client.id] || 0,
    created_at: client.created_at,
  }))
}

async function ClientsContent() {
  const clients = await getClients()

  if (clients.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Clients Found</CardTitle>
          <CardDescription>
            No clients found in the database.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Clients will appear here once they are added to the system.
          </p>
        </CardContent>
      </Card>
    )
  }

  return <ClientsList initialClients={clients} />
}

export default function ClientsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Clients</h1>
        <p className="text-slate-500">View and manage all clients</p>
      </div>

      <Suspense fallback={<ClientsSkeleton />}>
        <ClientsContent />
      </Suspense>
    </div>
  )
}
