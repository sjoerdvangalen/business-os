import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const results: any = {
    timestamp: new Date().toISOString(),
    contact_campaigns: {},
    leads: {}
  }

  // Check contact_campaigns
  const { data: ccSample, error: ccError } = await supabase
    .from('contact_campaigns')
    .select('*')
    .limit(5)

  if (ccError) {
    results.contact_campaigns.error = ccError.message
  } else {
    results.contact_campaigns.exists = true
    results.contact_campaigns.sample_rows = ccSample?.length || 0
    results.contact_campaigns.columns = ccSample && ccSample.length > 0 ? Object.keys(ccSample[0]) : []
    results.contact_campaigns.sample = ccSample

    // Get count
    const { data: ccAll, error: ccCountError } = await supabase
      .from('contact_campaigns')
      .select('id')

    results.contact_campaigns.row_count = ccAll?.length || 0
    results.contact_campaigns.count_error = ccCountError?.message
  }

  // Check leads for comparison
  const { data: leadsSample, error: leadsError } = await supabase
    .from('leads')
    .select('*')
    .limit(3)

  if (leadsError) {
    results.leads.error = leadsError.message
  } else {
    results.leads.exists = true
    results.leads.sample_rows = leadsSample?.length || 0
    results.leads.columns = leadsSample && leadsSample.length > 0 ? Object.keys(leadsSample[0]) : []

    const { data: leadsAll } = await supabase.from('leads').select('id')
    results.leads.row_count = leadsAll?.length || 0
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  })
})
