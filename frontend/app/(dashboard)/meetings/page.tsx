import { supabaseAdmin } from '@/lib/supabase/admin'
import MeetingsShell from './_components/MeetingsShell'

export const dynamic = 'force-dynamic'

interface Meeting {
  id: string
  name: string | null
  start_time: string | null
  end_time: string | null
  status: string | null
  booking_status: string | null
  attendee_name: string | null
  attendee_email: string | null
  client_id: string | null
  created_at: string
}

interface ClientName {
  id: string
  name: string
  client_code: string
}

export default async function MeetingsPage() {
  const { data: meetingsData } = await supabaseAdmin
    .from('meetings')
    .select('*')
    .order('start_time', { ascending: false })

  const { data: clientsData } = await supabaseAdmin
    .from('clients')
    .select('id, name, client_code')

  const meetings: Meeting[] = meetingsData || []
  const clients: ClientName[] = clientsData || []

  return (
    <MeetingsShell
      meetings={meetings}
      clients={clients}
    />
  )
}
