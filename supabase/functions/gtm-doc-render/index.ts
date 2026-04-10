import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Google OAuth helpers ────────────────────────────────────────────────────────

interface OAuthConfig {
  client_id: string
  client_secret: string
  refresh_token: string
  token_uri: string
}

async function getGoogleAccessToken(oauthConfigJson: string): Promise<string> {
  const config: OAuthConfig = JSON.parse(oauthConfigJson)

  const tokenRes = await fetch(config.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.client_id,
      client_secret: config.client_secret,
      refresh_token: config.refresh_token,
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    throw new Error(`Google OAuth error: ${err}`)
  }

  const tokenData = await tokenRes.json() as { access_token: string }
  return tokenData.access_token
}

// Legacy Service Account support (kept for backwards compatibility)
async function getGoogleAccessTokenFromServiceAccount(serviceAccountJson: string): Promise<string> {
  const serviceAccount = JSON.parse(serviceAccountJson)

  const now = Math.floor(Date.now() / 1000)
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const payload = btoa(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const pemKey = serviceAccount.private_key
  const pemBody = pemKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '')
  const keyBuffer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signingInput = `${header}.${payload}`
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signingInput)
  )

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const jwt = `${signingInput}.${signature}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    throw new Error(`Google OAuth error: ${err}`)
  }

  const tokenData = await tokenRes.json() as { access_token: string }
  return tokenData.access_token
}

async function createGoogleDoc(
  accessToken: string,
  title: string,
  content: string,
  folderId?: string
): Promise<string> {
  const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
  })

  if (!createRes.ok) {
    const err = await createRes.text()
    throw new Error(`Google Docs create error: ${err}`)
  }

  const doc = await createRes.json() as { documentId: string }
  const docId = doc.documentId

  const batchRes = await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [{
        insertText: {
          location: { index: 1 },
          text: content,
        },
      }],
    }),
  })

  if (!batchRes.ok) {
    const err = await batchRes.text()
    throw new Error(`Google Docs batchUpdate error: ${err}`)
  }

  if (folderId) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${docId}?addParents=${folderId}&fields=id`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
  }

  return `https://docs.google.com/document/d/${docId}/edit`
}

// ── Doc content builders ────────────────────────────────────────────────────────

function buildInternalDoc(
  clientName: string,
  synthesis: Record<string, unknown>
): string {
  const s = synthesis
  const lines: string[] = []

  lines.push(`GTM STRATEGY — INTERNAL`)
  lines.push(`Client: ${clientName}`)
  lines.push(`Synthesized: ${s.synthesized_at || 'Unknown'}`)
  lines.push(``)
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`COMPANY THESIS`)
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(String(s.company_thesis || ''))
  lines.push(``)

  const focus = (s.recommended_initial_focus as Record<string, string>) ?? {}
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`RECOMMENDED INITIAL FOCUS`)
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`Solution:  ${focus.solution || ''}`)
  lines.push(`ICP:       ${focus.icp || ''}`)
  lines.push(`Persona:   ${focus.persona || ''}`)
  lines.push(`Rationale: ${focus.rationale || ''}`)
  lines.push(``)

  const assumptions = (s.assumptions_and_open_questions as string[]) ?? []
  if (assumptions.length > 0) {
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    lines.push(`ASSUMPTIONS & OPEN QUESTIONS`)
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    assumptions.forEach((a, i) => lines.push(`${i + 1}. ${a}`))
    lines.push(``)
  }

  const solutions = (s.solutions as Array<Record<string, unknown>>) ?? []
  if (solutions.length > 0) {
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    lines.push(`SOLUTIONS`)
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    solutions.forEach(sol => {
      lines.push(`${sol.name}`)
      lines.push(`  ${sol.value_proposition}`)
      lines.push(`  ${sol.description}`)
      const proof = (sol.proof_points as string[]) ?? []
      if (proof.length > 0) lines.push(`  Proof: ${proof.join(' | ')}`)
      lines.push(``)
    })
  }

  const icpSegments = (s.icp_segments as Array<Record<string, unknown>>) ?? []
  if (icpSegments.length > 0) {
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    lines.push(`ICP SEGMENTS`)
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    icpSegments.forEach(seg => {
      lines.push(`${seg.name} (${seg.geo}, ${seg.employee_range})`)
      lines.push(`  Industries: ${(seg.industries as string[] ?? []).join(', ')}`)
      lines.push(`  Sourcing: ${seg.sourcing_logic}`)
      const signals = (seg.signal_hypotheses as string[]) ?? []
      if (signals.length > 0) lines.push(`  Signals: ${signals.join(' | ')}`)
      lines.push(``)
    })
  }

  const personas = (s.buyer_personas as Array<Record<string, unknown>>) ?? []
  if (personas.length > 0) {
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    lines.push(`BUYER PERSONAS`)
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    personas.forEach(p => {
      lines.push(`${p.title}`)
      const pains = (p.pain_points as string[]) ?? []
      if (pains.length > 0) lines.push(`  Pains: ${pains.join(' | ')}`)
      const motivations = (p.motivations as string[]) ?? []
      if (motivations.length > 0) lines.push(`  Motivations: ${motivations.join(' | ')}`)
      lines.push(``)
    })
  }

  const messaging = (s.messaging_direction as Record<string, string>) ?? {}
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`MESSAGING DIRECTION`)
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`Core angle: ${messaging.core_angle || ''}`)
  lines.push(`Proof narrative: ${messaging.proof_narrative || ''}`)
  lines.push(`Tone: ${messaging.tone_instructions || ''}`)
  lines.push(``)

  const research = (s.research_context as Record<string, unknown>) ?? {}
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`RESEARCH CONTEXT`)
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`Company: ${research.company_overview || ''}`)
  lines.push(``)
  lines.push(`Competition: ${research.competitive_landscape || ''}`)
  lines.push(``)
  lines.push(`Market: ${research.market_signals || ''}`)
  lines.push(``)

  const risks = (s.risks_and_assumptions as Array<Record<string, string>>) ?? []
  if (risks.length > 0) {
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    lines.push(`RISKS & ASSUMPTIONS [INTERNAL ONLY]`)
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    risks.forEach((r, i) => {
      lines.push(`${i + 1}. [${r.type?.toUpperCase()}] ${r.description}`)
      if (r.mitigation) lines.push(`   → ${r.mitigation}`)
    })
    lines.push(``)
  }

  if (s.internal_notes) {
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    lines.push(`INTERNAL NOTES`)
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    lines.push(String(s.internal_notes))
    lines.push(``)
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`INTERNAL REVIEW — SCORING (100 pts, ≥80 = APPROVE)`)
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`[ ] ICP specifiek genoeg?          (0-20 pts)  ___`)
  lines.push(`[ ] Pijn-propositie scherp?        (0-20 pts)  ___`)
  lines.push(`[ ] Proof assets overtuigend?      (0-20 pts)  ___`)
  lines.push(`[ ] Entry offer realistisch?       (0-20 pts)  ___`)
  lines.push(`[ ] Messaging richting duidelijk?  (0-20 pts)  ___`)
  lines.push(``)
  lines.push(`Score:    ___/100`)
  lines.push(`Feedback: ___`)
  lines.push(``)
  lines.push(`Approve: POST /functions/v1/gtm-approve { "client_id": "<id>", "action": "internal_approve", "score": <X>, "feedback": "..." }`)
  lines.push(`Reject:  POST /functions/v1/gtm-approve { "client_id": "<id>", "action": "internal_reject", "feedback": "..." }`)

  return lines.join('\n')
}

function buildExternalDoc(
  clientName: string,
  synthesis: Record<string, unknown>
): string {
  const s = synthesis
  const lines: string[] = []

  lines.push(`GTM STRATEGIE — ${clientName.toUpperCase()}`)
  lines.push(``)

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`WAT WE ZIEN`)
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(String(s.company_thesis || ''))
  lines.push(``)

  const focus = (s.recommended_initial_focus as Record<string, string>) ?? {}
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`AANBEVOLEN STARTPUNT`)
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`Oplossing: ${focus.solution || ''}`)
  lines.push(`Doelgroep: ${focus.icp || ''}`)
  lines.push(`Persona:   ${focus.persona || ''}`)
  lines.push(`Waarom:    ${focus.rationale || ''}`)
  lines.push(``)

  const icpSegments = (s.icp_segments as Array<Record<string, unknown>>) ?? []
  if (icpSegments.length > 0) {
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    lines.push(`DOELGROEPEN`)
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    icpSegments.forEach(seg => {
      lines.push(`${seg.name} — ${seg.geo}, ${seg.employee_range} medewerkers`)
      lines.push(`  Sectoren: ${(seg.industries as string[] ?? []).join(', ')}`)
      lines.push(``)
    })
  }

  const proofAssets = (s.proof_assets as Array<Record<string, unknown>>) ?? []
  if (proofAssets.length > 0) {
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    lines.push(`WAAROM HET WERKT`)
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    proofAssets.forEach(p => {
      lines.push(`${p.description}`)
    })
    lines.push(``)
  }

  const entryOffers = (s.entry_offers as Array<Record<string, unknown>>) ?? []
  if (entryOffers.length > 0) {
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    lines.push(`AANPAK & AANBOD`)
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    entryOffers.forEach(offer => {
      lines.push(`${offer.name}: ${offer.description}`)
      if (offer.conversion_hook) lines.push(`Hook: ${offer.conversion_hook}`)
      lines.push(``)
    })
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`VOLGENDE STAP`)
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`Heeft u opmerkingen of aanpassingen op de strategie? Laat het ons weten.`)
  lines.push(`Na uw goedkeuring starten we direct met de data & campagne opbouw.`)

  return lines.join('\n')
}

// ── Main handler ────────────────────────────────────────────────────────────────

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
    const { client_id, mode } = await req.json() as {
      client_id: string
      mode: 'internal' | 'external'
    }

    if (!client_id || !mode) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing client_id or mode' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (mode !== 'internal' && mode !== 'external') {
      return new Response(
        JSON.stringify({ success: false, error: 'mode must be internal or external' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: client, error: fetchError } = await supabase
      .from('clients')
      .select('id, name, strategy_synthesis, workflow_metrics, approval_status')
      .eq('id', client_id)
      .single()

    if (fetchError || !client) {
      return new Response(
        JSON.stringify({ success: false, error: `Client not found: ${fetchError?.message}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!client.strategy_synthesis) {
      return new Response(
        JSON.stringify({ success: false, error: 'strategy_synthesis not yet available' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const synthesis = client.strategy_synthesis as Record<string, unknown>
    const wm = (client.workflow_metrics as Record<string, unknown>) ?? {}
    const now = new Date().toISOString()

    const oauthConfigJson = Deno.env.get('GOOGLE_OAUTH_CONFIG')
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    const googleFolderId = Deno.env.get('GOOGLE_DRIVE_FOLDER_ID')

    let docUrl: string | null = null
    let docError: string | null = null
    const googleConfigured = !!(oauthConfigJson || serviceAccountJson)

    if (googleConfigured) {
      const title = mode === 'internal'
        ? `GTM Strategy — ${client.name} [Internal]`
        : `GTM Strategy — ${client.name}`

      const content = mode === 'internal'
        ? buildInternalDoc(String(client.name), synthesis)
        : buildExternalDoc(String(client.name), synthesis)

      try {
        let accessToken: string
        if (oauthConfigJson) {
          console.log(`[${requestId}] Using OAuth configuration`)
          accessToken = await getGoogleAccessToken(oauthConfigJson)
        } else {
          console.log(`[${requestId}] Using Service Account configuration (legacy)`)
          accessToken = await getGoogleAccessTokenFromServiceAccount(serviceAccountJson!)
        }
        docUrl = await createGoogleDoc(accessToken, title, content, googleFolderId)
        console.log(`[${requestId}] Google Doc created: ${docUrl}`)
      } catch (err) {
        docError = (err as Error).message
        console.error(`[${requestId}] Google Doc creation failed: ${docError}`)
      }
    } else {
      console.warn(`[${requestId}] GOOGLE_OAUTH_CONFIG or GOOGLE_SERVICE_ACCOUNT_JSON not configured — skipping doc creation`)
    }

    // ── Handle failure path ────────────────────────────────────────────────
    if (googleConfigured && docError) {
      // Doc creation was attempted but failed — update workflow_metrics with error, do NOT advance approval_status
      let failureWm: Record<string, unknown>

      if (mode === 'internal') {
        failureWm = {
          ...wm,
          internal_approval: {
            ...((wm.internal_approval as Record<string, unknown>) ?? {}),
            last_feedback: `Doc render failed: ${docError}`,
          },
        }
      } else {
        // external: rollback approval_status to internal_approved, log error
        failureWm = {
          ...wm,
          external_approval: {
            ...((wm.external_approval as Record<string, unknown>) ?? {}),
            last_feedback: `Doc render failed: ${docError}`,
          },
        }
        await supabase
          .from('clients')
          .update({ workflow_metrics: failureWm, approval_status: 'internal_approved' })
          .eq('id', client_id)

        return new Response(
          JSON.stringify({ success: false, error: `External doc render failed: ${docError}`, request_id: requestId }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      await supabase
        .from('clients')
        .update({ workflow_metrics: failureWm })
        .eq('id', client_id)

      return new Response(
        JSON.stringify({ success: false, error: `Internal doc render failed: ${docError}`, request_id: requestId }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Update DB based on mode ────────────────────────────────────────────
    let updatePayload: Record<string, unknown> = {}

    if (mode === 'internal') {
      const updatedWm = {
        ...wm,
        internal_approval: {
          ...((wm.internal_approval as Record<string, unknown>) ?? {}),
          status: 'pending',
          started_at: now,
        },
      }
      updatePayload = {
        approval_status: 'internal_review',
        stage: 'internal_approval',
        workflow_metrics: updatedWm,
        ...(docUrl ? { gtm_strategy_doc_url: docUrl } : {}),
      }
    } else {
      // external
      const externalApprovalBlock = (wm.external_approval as Record<string, unknown>) ?? {}
      const updatedWm = {
        ...wm,
        external_approval: {
          ...externalApprovalBlock,
          status: 'pending',
          started_at: now,
        },
      }
      updatePayload = {
        approval_status: 'external_sent',
        stage: 'external_approval',
        workflow_metrics: updatedWm,
        ...(docUrl ? { gtm_strategy_doc_external_url: docUrl } : {}),
      }
    }

    const { error: updateError } = await supabase
      .from('clients')
      .update(updatePayload)
      .eq('id', client_id)

    if (updateError) {
      console.error(`[${requestId}] DB update failed:`, updateError.message)
      return new Response(
        JSON.stringify({ success: false, error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Fire notifications ─────────────────────────────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    fetch(`${supabaseUrl}/functions/v1/gtm-gate-notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
      body: JSON.stringify({ client_id, event: mode === 'internal' ? 'internal_review' : 'external_review' }),
    }).catch(err => console.error(`[${requestId}] gtm-gate-notify failed:`, err.message))

    console.log(`[${requestId}] Doc render complete: mode=${mode} client=${client_id} doc=${docUrl ?? 'skipped'}`)

    return new Response(
      JSON.stringify({
        success: true,
        client_id,
        mode,
        doc_url: docUrl,
        google_configured: googleConfigured,
        request_id: requestId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const msg = (error as Error).message
    console.error(`[${requestId}] Unhandled error:`, msg)
    return new Response(
      JSON.stringify({ success: false, error: msg, request_id: requestId }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
