import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const results: any = {}

  // Check domains
  const { data: domains, error: derr } = await supabase
    .from('domains')
    .select('id, domain, created_at')
    .limit(10)
  results.domains = { count: domains?.length, sample: domains, error: derr?.message }

  // Check inboxes with domain_id
  const { data: linked, error: lerr } = await supabase
    .from('email_inboxes')
    .select('id, email, domain_id')
    .not('domain_id', 'is', null)
    .limit(10)
  results.linked_inboxes = { count: linked?.length, sample: linked, error: lerr?.message }

  // Check sample of unlinked inboxes
  const { data: unlinked, error: uerr } = await supabase
    .from('email_inboxes')
    .select('id, email')
    .is('domain_id', null)
    .limit(5)
  results.unlinked_sample = { count: unlinked?.length, sample: unlinked, error: uerr?.message }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  })
})
