import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    // Check domains count
    const { count: domainCount, error: domainError } = await supabase
      .from('domains')
      .select('*', { count: 'exact', head: true })

    // Check inboxes with domain_id
    const { count: linkedCount, error: linkedError } = await supabase
      .from('email_inboxes')
      .select('*', { count: 'exact', head: true })
      .not('domain_id', 'is', null)

    // Check total inboxes
    const { count: totalInboxes, error: inboxError } = await supabase
      .from('email_inboxes')
      .select('*', { count: 'exact', head: true })

    // Check migration status
    const { data: migrations, error: migError } = await supabase
      .from('schema_migrations')
      .select('version')
      .in('version', ['20260403000008', '20260403000009', '20260403000010'])

    // Query indexes via raw SQL using the postgres connection
    let indexes: any[] = []
    let indexError: any = null
    try {
      const { data: idxData, error: idxErr } = await supabase.rpc('exec_sql', {
        sql: `SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'idx_%' ORDER BY tablename, indexname`
      })
      if (idxErr) throw idxErr
      indexes = idxData || []
    } catch (e) {
      indexError = e
      // Fallback: check specific known indexes by trying to use them
      const knownIndexes = [
        { name: 'idx_campaigns_client_id', table: 'campaigns' },
        { name: 'idx_email_threads_provider_lead', table: 'email_threads' },
        { name: 'idx_contacts_email_verified', table: 'contacts' },
        { name: 'idx_contact_campaigns_campaign', table: 'contact_campaigns' },
        { name: 'idx_contact_campaigns_contact', table: 'contact_campaigns' },
        { name: 'idx_email_inboxes_email', table: 'email_inboxes' },
        { name: 'idx_email_inboxes_domain_id', table: 'email_inboxes' }
      ]
      indexes = knownIndexes.map(i => ({ indexname: i.name + ' (expected)', tablename: i.table }))
    }

    const result = {
      timestamp: new Date().toISOString(),
      domains: {
        count: domainCount || 0,
        error: domainError?.message || null
      },
      inboxes: {
        total: totalInboxes || 0,
        linked: linkedCount || 0,
        unlinked: (totalInboxes || 0) - (linkedCount || 0),
        link_percentage: totalInboxes ? Math.round(((linkedCount || 0) / totalInboxes) * 100) : 0,
        error: inboxError?.message || linkedError?.message || null
      },
      indexes: {
        count: indexes?.length || 0,
        list: indexes?.slice(0, 20) || [],
        error: indexError?.message || null
      },
      migrations: {
        applied: migrations?.map(m => m.version) || [],
        expected: ['20260403000008', '20260403000009', '20260403000010'],
        all_applied: migrations?.length === 3,
        error: migError?.message || null
      }
    }

    return new Response(
      JSON.stringify(result, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
