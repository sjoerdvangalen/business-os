import { supabaseAdmin } from '@/lib/supabase/admin'
import CampaignsShell from './_components/CampaignsShell'

export const dynamic = 'force-dynamic'

export default async function CampaignsPage() {
  const { data: campaignsData } = await supabaseAdmin
    .from('campaigns')
    .select('id, name, client_id, status, health_status, reply_rate, bounce_rate, emails_sent, replies, bounces, provider, cell_id, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  const { data: clientsData } = await supabaseAdmin
    .from('clients')
    .select('id, name, client_code')

  const { data: sequencesData } = await supabaseAdmin
    .from('email_sequences')
    .select('id, campaign_id, step_number, name, subject, sent, replies, wait_time_days, is_active')
    .in('campaign_id', (campaignsData || []).map((c: { id: string }) => c.id))
    .order('step_number', { ascending: true })

  const { data: cellsData } = await supabaseAdmin
    .from('campaign_cells')
    .select('id, campaign_id, cell_code, status, solution_key, icp_key, persona_key, campaign_archetype, signal_tier, hook_variant, offer_variant, cta_variant')
    .in('campaign_id', (campaignsData || []).map((c: { id: string }) => c.id))

  return (
    <CampaignsShell
      campaigns={campaignsData || []}
      clients={clientsData || []}
      sequences={sequencesData || []}
      cells={cellsData || []}
    />
  )
}
