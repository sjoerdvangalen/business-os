import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
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
  try {
    const supabase = await createClient()

    // Fetch clients with campaign count
    const { data: clients, error } = await supabase
      .from('clients')
      .select(`
        id,
        client_code,
        name,
        status,
        stage,
        created_at,
        campaigns:campaigns(count)
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching clients:', error)
      return []
    }

    // Transform the data to include campaign count
    return (clients || []).map((client: any) => ({
      id: client.id,
      client_code: client.client_code,
      name: client.name,
      status: client.status,
      stage: client.stage,
      campaign_count: client.campaigns?.[0]?.count || 0,
      created_at: client.created_at,
    }))
  } catch (error) {
    console.error('Error in getClients:', error)
    return []
  }
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
