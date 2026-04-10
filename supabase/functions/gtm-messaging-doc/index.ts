import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const KIMI_API_KEY = Deno.env.get('KIMI_API_KEY') ?? ''
const KIMI_MESSAGES_URL = 'https://api.kimi.com/coding/v1/messages'
const MESSAGING_MODEL = 'kimi-k2-5'

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

const SYSTEM_PROMPT = `You are a senior B2B cold email strategist and copywriter. Your job is to produce a messaging layer document that guides the copy team on angles, proof, tone, hooks, and draft email copy.

Output ONLY valid JSON matching the exact schema provided. No markdown, no preamble.

Schema:
{
  "messaging_strategy": {
    "core_narrative": "The overarching story to tell across all outreach",
    "primary_angle": "The single sharpest angle for the priority ICP × persona combo",
    "secondary_angles": ["2-3 backup angles for A/B testing"],
    "proof_strategy": "How to weave social proof without being salesy"
  },
  "angle_directions": [
    {
      "icp": "ICP segment name",
      "persona": "Persona title",
      "angle": "Specific angle for this combo",
      "hook_idea": "What the hook should feel like",
      "proof_to_use": "Which proof points to use",
      "tone_note": "Any combo-specific tone adjustments"
    }
  ],
  "proof_usage_by_segment": [
    {
      "segment": "ICP segment name",
      "proof_points": ["Most credible proof for this segment"],
      "avoid": ["Proof that would not resonate or is inappropriate"]
    }
  ],
  "tone_guide": {
    "overall": "Primary tone description",
    "do": ["Things to do in copy"],
    "dont": ["Things to avoid in copy"],
    "signature_phrases": ["Phrases or framings that fit this brand voice"]
  },
  "hook_variants": [
    {
      "icp_persona": "ICP × Persona label",
      "hooks": [
        {
          "text": "The hook line (opening sentence)",
          "angle": "Which angle this uses",
          "note": "Why this works for this audience"
        }
      ]
    }
  ],
  "subject_lines": [
    {
      "icp_persona": "ICP × Persona label",
      "subjects": ["2-5 subject line variants (2-5 words, lowercase, no punctuation)"]
    }
  ],
  "copy_angles": [
    {
      "icp_persona": "ICP × Persona label",
      "angle_name": "Short label",
      "opening": "Full opening sentence",
      "body_direction": "1-2 sentences on what the body should say",
      "cta": "The call to action",
      "word_count_target": 65
    }
  ],
  "generated_at": "ISO timestamp"
}`

interface SourcingSegment {
  name: string
  companies: number
  contacts: number
}

function buildUserPrompt(synthesis: Record<string, unknown>, sourcingSegments?: SourcingSegment[]): string {
  const focus = (synthesis.recommended_initial_focus as Record<string, string>) ?? {}
  const icpSegments = (synthesis.icp_segments as Array<Record<string, unknown>>) ?? []
  const personas = (synthesis.buyer_personas as Array<Record<string, unknown>>) ?? []
  const combos = (synthesis.icp_persona_combinations as Array<Record<string, unknown>>) ?? []
  const messaging = (synthesis.messaging_direction as Record<string, string>) ?? {}
  const proofAssets = (synthesis.proof_assets as Array<Record<string, unknown>>) ?? []
  const entryOffers = (synthesis.entry_offers as Array<Record<string, unknown>>) ?? []

  const sourcingContext = sourcingSegments && sourcingSegments.length > 0
    ? `\n## SOURCING CONTEXT (verified real audience — use this to ground your messaging)\n${sourcingSegments.map(s => `• ${s.name}: ${s.companies} bedrijven, ${s.contacts} contacten gevonden`).join('\n')}\n\nSchrijf messaging die past bij deze specifieke mensen en volumes — niet generiek.\n`
    : ''

  return `
## COMPANY THESIS
${synthesis.company_thesis || ''}

## RECOMMENDED INITIAL FOCUS
Solution: ${focus.solution || ''}
ICP: ${focus.icp || ''}
Persona: ${focus.persona || ''}
Rationale: ${focus.rationale || ''}

## ICP SEGMENTS
${icpSegments.map(s => `${s.name} (${s.geo}, ${s.employee_range})\n  Industries: ${(s.industries as string[] ?? []).join(', ')}\n  Signal hypotheses: ${(s.signal_hypotheses as string[] ?? []).join(' | ')}`).join('\n\n')}

## BUYER PERSONAS
${personas.map(p => `${p.title}\n  Pains: ${(p.pain_points as string[] ?? []).join(' | ')}\n  Motivations: ${(p.motivations as string[] ?? []).join(' | ')}`).join('\n\n')}

## ICP × PERSONA COMBINATIONS (priority order)
${combos.map(c => `${c.icp} × ${c.persona} [${c.priority}] — ${c.rationale}`).join('\n')}
${sourcingContext}

## MESSAGING DIRECTION (from strategy)
Core angle: ${messaging.core_angle || ''}
Proof narrative: ${messaging.proof_narrative || ''}
Tone: ${messaging.tone_instructions || ''}

## PROOF ASSETS
${proofAssets.map(p => `[${p.type}] ${p.description} (use for: ${p.use_for})`).join('\n')}

## ENTRY OFFERS
${entryOffers.map(e => `${e.name}: ${e.description}\n  Fits: ${(e.fits_icp as string[] ?? []).join(', ')}\n  Hook: ${e.conversion_hook}`).join('\n\n')}

Now produce the complete messaging layer document JSON. Focus on the top 2-3 ICP × persona combinations. Each hook should be a concrete opening sentence (not a placeholder). Subject lines should be 2-5 words, lowercase, no punctuation. Copy angles should be tight (target 65 words).
`.trim()
}

function buildMessagingDocContent(clientName: string, messagingDoc: Record<string, unknown>): string {
  const lines: string[] = []

  lines.push(`MESSAGING STRATEGY DOCUMENT`)
  lines.push(`Client: ${clientName}`)
  lines.push(`Generated: ${messagingDoc.generated_at || new Date().toISOString()}`)
  lines.push(``)

  const strategy = (messagingDoc.messaging_strategy as Record<string, unknown>) ?? {}
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`MESSAGING STRATEGY`)
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`Core Narrative: ${strategy.core_narrative || ''}`)
  lines.push(`Primary Angle: ${strategy.primary_angle || ''}`)
  lines.push(``)

  const secondaryAngles = (strategy.secondary_angles as string[]) ?? []
  if (secondaryAngles.length > 0) {
    lines.push(`Secondary Angles (for A/B testing):`)
    secondaryAngles.forEach((a, i) => lines.push(`  ${i + 1}. ${a}`))
    lines.push(``)
  }

  lines.push(`Proof Strategy: ${strategy.proof_strategy || ''}`)
  lines.push(``)

  const angleDirections = (messagingDoc.angle_directions as Array<Record<string, unknown>>) ?? []
  if (angleDirections.length > 0) {
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    lines.push(`ANGLE DIRECTIONS BY ICP × PERSONA`)
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    angleDirections.forEach(ad => {
      lines.push(`${ad.icp} × ${ad.persona}`)
      lines.push(`  Angle: ${ad.angle || ''}`)
      lines.push(`  Hook Idea: ${ad.hook_idea || ''}`)
      lines.push(`  Proof to Use: ${ad.proof_to_use || ''}`)
      lines.push(`  Tone: ${ad.tone_note || ''}`)
      lines.push(``)
    })
  }

  const proofUsage = (messagingDoc.proof_usage_by_segment as Array<Record<string, unknown>>) ?? []
  if (proofUsage.length > 0) {
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    lines.push(`PROOF USAGE BY SEGMENT`)
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    proofUsage.forEach(p => {
      lines.push(`${p.segment}`)
      const proofPoints = (p.proof_points as string[]) ?? []
      if (proofPoints.length > 0) {
        lines.push(`  Use: ${proofPoints.join(' | ')}`)
      }
      const avoid = (p.avoid as string[]) ?? []
      if (avoid.length > 0) {
        lines.push(`  Avoid: ${avoid.join(' | ')}`)
      }
      lines.push(``)
    })
  }

  const toneGuide = (messagingDoc.tone_guide as Record<string, unknown>) ?? {}
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`TONE GUIDE`)
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`Overall: ${toneGuide.overall || ''}`)
  lines.push(``)

  const toneDo = (toneGuide.do as string[]) ?? []
  if (toneDo.length > 0) {
    lines.push(`Do:`)
    toneDo.forEach(d => lines.push(`  ✓ ${d}`))
    lines.push(``)
  }

  const toneDont = (toneGuide.dont as string[]) ?? []
  if (toneDont.length > 0) {
    lines.push(`Don't:`)
    toneDont.forEach(d => lines.push(`  ✗ ${d}`))
    lines.push(``)
  }

  const signaturePhrases = (toneGuide.signature_phrases as string[]) ?? []
  if (signaturePhrases.length > 0) {
    lines.push(`Signature Phrases:`)
    signaturePhrases.forEach(p => lines.push(`  "${p}"`))
    lines.push(``)
  }

  const hookVariants = (messagingDoc.hook_variants as Array<Record<string, unknown>>) ?? []
  if (hookVariants.length > 0) {
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    lines.push(`HOOK VARIANTS`)
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    hookVariants.forEach(hv => {
      lines.push(`${hv.icp_persona}`)
      const hooks = (hv.hooks as Array<Record<string, unknown>>) ?? []
      hooks.forEach((h, i) => {
        lines.push(`  ${i + 1}. "${h.text}"`)
        lines.push(`     Angle: ${h.angle || ''}`)
        lines.push(`     Note: ${h.note || ''}`)
      })
      lines.push(``)
    })
  }

  const subjectLines = (messagingDoc.subject_lines as Array<Record<string, unknown>>) ?? []
  if (subjectLines.length > 0) {
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    lines.push(`SUBJECT LINES`)
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    subjectLines.forEach(sl => {
      lines.push(`${sl.icp_persona}`)
      const subjects = (sl.subjects as string[]) ?? []
      subjects.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`))
      lines.push(``)
    })
  }

  const copyAngles = (messagingDoc.copy_angles as Array<Record<string, unknown>>) ?? []
  if (copyAngles.length > 0) {
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    lines.push(`COPY ANGLES`)
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    copyAngles.forEach(ca => {
      lines.push(`${ca.icp_persona} — ${ca.angle_name}`)
      lines.push(`Opening: ${ca.opening || ''}`)
      lines.push(`Body Direction: ${ca.body_direction || ''}`)
      lines.push(`CTA: ${ca.cta || ''}`)
      lines.push(`Target: ${ca.word_count_target || 65} words`)
      lines.push(``)
    })
  }

  return lines.join('\n')
}

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
    const { client_id } = await req.json() as { client_id: string }

    if (!client_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing client_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!KIMI_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'KIMI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: client, error: fetchError } = await supabase
      .from('clients')
      .select('id, name, strategy_synthesis, workflow_metrics')
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
        JSON.stringify({ success: false, error: 'strategy_synthesis not available' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const synthesis = client.strategy_synthesis as Record<string, unknown>
    const wm = (client.workflow_metrics as Record<string, unknown>) ?? {}
    const now = new Date().toISOString()

    const messagingApproval = (wm.messaging_approval as Record<string, unknown>) ?? {}
    const isRevision = messagingApproval.status === 'rejected'
    const currentAttempts = (messagingApproval.attempts as number) ?? 0

    // Read sourcing context from previous sourcing step
    const sourcingReview = (wm.sourcing_review as Record<string, unknown>) ?? {}
    const sourcingSegments = (sourcingReview.segments as SourcingSegment[]) ?? []

    console.log(`[${requestId}] Generating messaging doc for client ${client_id} (attempt ${currentAttempts + 1}, ${sourcingSegments.length} sourcing segments available)`)

    const userPrompt = buildUserPrompt(synthesis, sourcingSegments)

    const combinedPrompt = `${SYSTEM_PROMPT}\n\n---\n\n${userPrompt}`

    const chatResponse = await fetch(KIMI_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': KIMI_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MESSAGING_MODEL,
        messages: [{ role: 'user', content: combinedPrompt }],
        max_tokens: 6000,
        temperature: 0.4,
      }),
    })

    if (!chatResponse.ok) {
      const errText = await chatResponse.text()
      console.error(`[${requestId}] LLM API error ${chatResponse.status}: ${errText}`)
      return new Response(
        JSON.stringify({ success: false, error: `LLM API error: ${chatResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const chatData = await chatResponse.json() as {
      content?: Array<{ type: string; text?: string }>
    }

    const rawContent = chatData.content?.[0]?.text
    if (!rawContent) {
      return new Response(
        JSON.stringify({ success: false, error: 'LLM returned empty response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let messagingDoc: Record<string, unknown>
    try {
      const jsonMatch = rawContent.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || rawContent.match(/(\{[\s\S]*\})/)
      const jsonStr = jsonMatch ? jsonMatch[1] : rawContent
      messagingDoc = JSON.parse(jsonStr)
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'LLM output is not valid JSON', raw: rawContent.substring(0, 500) }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    messagingDoc.generated_at = now

    // ── Create Google Doc ────────────────────────────────────────────────────
    const oauthConfigJson = Deno.env.get('GOOGLE_OAUTH_CONFIG')
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    const googleFolderId = Deno.env.get('GOOGLE_DRIVE_FOLDER_ID')
    const googleConfigured = !!(oauthConfigJson || serviceAccountJson)

    let docUrl: string | null = null

    if (googleConfigured) {
      const title = `Messaging Strategy — ${client.name}`
      const content = buildMessagingDocContent(client.name, messagingDoc)

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
        console.error(`[${requestId}] Google Doc creation failed:`, (err as Error).message)
      }
    } else {
      console.warn(`[${requestId}] Google auth not configured — skipping doc creation`)
    }

    // Update DB
    const updatedWm = {
      ...wm,
      messaging_approval: {
        ...messagingApproval,
        status: 'pending',
        started_at: messagingApproval.started_at ?? now,
        attempts: isRevision ? currentAttempts + 1 : Math.max(currentAttempts, 1),
        decided_at: null,
        last_feedback: messagingApproval.last_feedback ?? null,
      },
    }

    const updatePayload: Record<string, unknown> = {
      stage: 'messaging_approval',
      workflow_metrics: updatedWm,
    }
    if (docUrl) updatePayload.messaging_doc_url = docUrl

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

    // Notify via Slack
    const slackBotToken = Deno.env.get('SLACK_BOT_TOKEN')
    const slackChannel = Deno.env.get('SLACK_TEST_CHANNEL')

    if (slackBotToken && slackChannel) {
      fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${slackBotToken}` },
        body: JSON.stringify({
          channel: slackChannel,
          text: `Messaging doc ready for review: ${client.name}`,
          blocks: [{
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Messaging Document — Review Required*\n\nClient: *${client.name}*\n\nApprove via:\n\`\`\`POST /functions/v1/gtm-approve\n{ "client_id": "${client_id}", "action": "messaging_approve" }\`\`\``,
            },
          }],
        }),
      }).catch(err => console.error(`[${requestId}] Slack notify failed:`, err.message))
    }

    console.log(`[${requestId}] Messaging doc generated for client ${client_id}`)

    return new Response(
      JSON.stringify({ success: true, client_id, request_id: requestId }),
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
