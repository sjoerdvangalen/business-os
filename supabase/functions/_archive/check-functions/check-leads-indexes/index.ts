import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const expectedIndexes = [
    { name: 'idx_leads_contact', column: 'contact_id' },
    { name: 'idx_leads_campaign', column: 'campaign_id' },
    { name: 'idx_leads_client', column: 'client_id' },
    { name: 'idx_leads_status', column: 'status' },
    { name: 'idx_leads_plusvibe', column: 'plusvibe_lead_id' }
  ]

  const results: any = {
    timestamp: new Date().toISOString(),
    expected_indexes: expectedIndexes,
    status: 'check manually in Supabase Dashboard > Database > Indexes'
  }

  // Try to verify by running queries that would use the indexes
  for (const idx of expectedIndexes) {
    try {
      // Run a query that would benefit from this index
      const { data, error } = await supabase
        .from('leads')
        .select('id')
        .eq(idx.column, '00000000-0000-0000-0000-000000000000')
        .limit(1)

      results[idx.name] = {
        column: idx.column,
        query_works: !error,
        error: error?.message || null
      }
    } catch (e: any) {
      results[idx.name] = {
        column: idx.column,
        query_works: false,
        error: e.message
      }
    }
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  })
})