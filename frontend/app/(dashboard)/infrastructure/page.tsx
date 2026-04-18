import { Suspense } from 'react'
import { supabaseAdmin } from '@/lib/supabase/admin'
import InfrastructureShell from './_components/InfrastructureShell'

export const dynamic = 'force-dynamic'

interface Domain {
  id: string
  domain: string
  client_id: string | null
  spf_status: string | null
  dkim_status: string | null
  dmarc_status: string | null
  health_score: number | null
  created_at: string
}

interface Inbox {
  id: string
  email: string
  client_id: string | null
  status: string | null
  warmup_score: number | null
  daily_send_limit: number | null
  sent_today: number | null
  created_at: string
}

interface ClientName {
  id: string
  name: string
  client_code: string
}

async function fetchAll<T>(
  table: string,
  orderBy: string
): Promise<T[]> {
  const all: T[] = []
  const pageSize = 1000
  let page = 0

  while (true) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select('*')
      .order(orderBy, { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (error) {
      console.error(`Error fetching ${table}:`, error)
      break
    }

    if (!data || data.length === 0) break

    all.push(...(data as T[]))

    if (data.length < pageSize) break
    page++
  }

  return all
}

export default async function InfrastructurePage() {
  const [domains, inboxes, clientsData] = await Promise.all([
    fetchAll<Domain>('domains', 'created_at'),
    fetchAll<Inbox>('email_inboxes', 'created_at'),
    supabaseAdmin.from('clients').select('id, name, client_code'),
  ])

  const clients: ClientName[] = clientsData.data || []

  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Loading infrastructure...</div>}>
      <InfrastructureShell
        domains={domains}
        inboxes={inboxes}
        clients={clients}
      />
    </Suspense>
  )
}
