import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function checkLiveTestReadiness(
  supabase: SupabaseClient,
  clientId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('clients')
    .select('workflow_metrics')
    .eq('id', clientId)
    .single()

  if (error || !data) {
    console.error('[checkLiveTestReadiness] failed to fetch client:', error?.message)
    return
  }

  const wm = data.workflow_metrics
  if (
    wm?.messaging_approval?.status === 'approved' &&
    wm?.sourcing_review?.status   === 'approved' &&
    wm?.infra?.status             === 'ready'
  ) {
    // Guard: ensure enriched cells exist before triggering push
    const { count, error: cellCountError } = await supabase
      .from('campaign_cells')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('status', 'ready')

    if (cellCountError || !count || count === 0) {
      console.warn('[checkLiveTestReadiness] No ready cells found — skipping campaign push')
      return
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    EdgeRuntime.waitUntil(
      fetch(`${supabaseUrl}/functions/v1/gtm-campaign-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ client_id: clientId }),
      })
        .then(res => {
          if (!res.ok) console.error('[checkLiveTestReadiness] campaign-push failed:', res.status)
        })
        .catch(err => console.error('[checkLiveTestReadiness] campaign-push error:', err))
    )
  }
}
