import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

/**
 * Setup Cron Jobs - Creates exec_sql function and configures jobs
 */

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // First create the exec_sql function
  const createFunctionSql = `
    CREATE OR REPLACE FUNCTION exec_sql(sql text)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      EXECUTE sql;
    END;
    $$;
  `

  const sqlQueries = [
    `SELECT cron.schedule('icp-analysis', '0 2 * * 0', $$SELECT net.http_get('https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/analyze-icp')$$);`,
    `SELECT cron.schedule('attribution-analysis', '0 3 * * *', $$SELECT net.http_get('https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/analyze-attribution')$$);`,
    `SELECT cron.schedule('anomaly-detection', '*/15 * * * *', $$SELECT net.http_get('https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/detect-anomalies')$$);`
  ]

  try {
    // Step 1: Create exec_sql function by querying the query endpoint directly
    // This won't work from REST API - we need a different approach

    // Let's try using the pg_net extension via a query
    const results: Record<string, any> = {
      step: 'Attempting SQL execution',
      note: 'Direct SQL execution from Edge Function requires specific setup'
    }

    // Alternative: Use pg_net to call the function via HTTP
    const netQuery = `
      SELECT net.http_post(
        url:='${SUPABASE_URL}/rest/v1/rpc/exec_sql',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer ${SUPABASE_SERVICE_ROLE_KEY}", "apikey": "${SUPABASE_SERVICE_ROLE_KEY}"}'::jsonb,
        body:='{"sql": "SELECT 1"}'::jsonb
      );
    `

    // We can't execute this either without exec_sql existing

    return new Response(
      JSON.stringify({
        success: false,
        message: 'Cannot execute SQL from Edge Function without pre-existing exec_sql RPC',
        workaround: 'You must run the SQL manually in Supabase SQL Editor',
        sql_to_run: sqlQueries.join('\n\n'),
        create_exec_sql_first: createFunctionSql
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error).message
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
