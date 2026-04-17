import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

export async function validateSetup() {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  
  // Check domains count
  const { count: domainCount, error: domainError } = await supabase
    .from('domains')
    .select('*', { count: 'exact', head: true })
  
  // Check inboxes with domain_id
  const { count: linkedCount, error: linkedError } = await supabase
    .from('email_inboxes')
    .select('*', { count: 'exact', head: true })
    .not('domain_id', 'is', null)
  
  // Check indexes exist
  const { data: indexes, error: indexError } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT indexname FROM pg_indexes 
      WHERE tablename IN ('campaigns', 'email_threads', 'contacts', 'contact_campaigns', 'email_inboxes')
      AND indexname LIKE 'idx_%'
    `
  })
  
  return {
    domains: { count: domainCount, error: domainError?.message },
    linked_inboxes: { count: linkedCount, error: linkedError?.message },
    indexes: { data: indexes, error: indexError?.message }
  }
}
