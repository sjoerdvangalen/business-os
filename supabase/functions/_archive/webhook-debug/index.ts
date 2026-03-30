import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Webhook Debug — captures and logs ALL incoming webhooks raw
 * Use this to inspect PlusVibe payload format
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
  
  try {
    // Get raw body
    const rawBody = await req.text()
    let payload = {}
    
    try {
      payload = JSON.parse(rawBody)
    } catch {
      payload = { raw: rawBody }
    }

    // Log everything
    console.log(`[${requestId}] === WEBHOOK RECEIVED ===`)
    console.log(`[${requestId}] Method: ${req.method}`)
    console.log(`[${requestId}] URL: ${req.url}`)
    console.log(`[${requestId}] Headers:`, JSON.stringify(Object.fromEntries(req.headers.entries())))
    console.log(`[${requestId}] Body:`, rawBody.substring(0, 5000))

    // Store in webhook_logs
    const { error } = await supabase.from('webhook_logs').insert({
      source: 'plusvibe-debug',
      event_type: (payload as any).event || (payload as any).event_type || 'unknown',
      payload: payload,
      status: 'received',
      request_id: requestId,
    })

    if (error) {
      console.error(`[${requestId}] Failed to log:`, error.message)
    }

    // Return success so PlusVibe knows it worked
    return new Response(
      JSON.stringify({ 
        success: true, 
        request_id: requestId,
        message: 'Webhook logged for debugging'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error(`[${requestId}] Error:`, (error as Error).message)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: (error as Error).message,
        request_id: requestId 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
