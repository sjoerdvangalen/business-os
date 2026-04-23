import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callRailway } from "../_shared/railway-client.ts";

serve(async (req) => {
  const body = await req.json();
  const result = await callRailway('/gtm/messaging-doc', body);
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
});
