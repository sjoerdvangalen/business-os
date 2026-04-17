import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Get total leads count with pagination
  let allLeads: any[] = []
  let page = 0
  const pageSize = 1000
  let hasMore = true

  while (hasMore && page < 50) { // Safety limit
    const { data, error } = await supabase
      .from('leads')
      .select('id')
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }

    if (data && data.length > 0) {
      allLeads = allLeads.concat(data)
      page++
      hasMore = data.length === pageSize
    } else {
      hasMore = false
    }
  }

  // Get sample with all columns
  const { data: sample } = await supabase
    .from('leads')
    .select('*')
    .limit(2)

  return new Response(JSON.stringify({
    timestamp: new Date().toISOString(),
    total_leads: allLeads.length,
    sample_leads: sample
  }, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  })
})
