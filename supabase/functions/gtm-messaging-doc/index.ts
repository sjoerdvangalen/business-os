import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { resolveFormula } from '../_shared/formula_resolver.ts'

const KIMI_API_KEY = Deno.env.get('KIMI_API_KEY') ?? ''
const KIMI_BASE_URL = (Deno.env.get('KIMI_BASE_URL') || 'https://api.kimi.com').replace(/\/$/, '')
const MESSAGING_MODEL = 'kimi-k2-turbo-preview'

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

interface DocBlock {
  style: 'HEADING_1' | 'HEADING_2' | 'HEADING_3' | 'NORMAL_TEXT'
  text: string
  bold?: boolean
}

function extractDocId(url: string): string | null {
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
  return match?.[1] ?? null
}

async function appendToDoc(accessToken: string, docId: string, blocks: DocBlock[]): Promise<void> {
  const getRes = await fetch(`https://docs.googleapis.com/v1/documents/${docId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })
  if (!getRes.ok) throw new Error(`Google Docs get error: ${await getRes.text()}`)

  const doc = await getRes.json() as { body: { content: Array<{ endIndex?: number }> } }
  const content = doc.body.content
  const docEndIndex = (content[content.length - 1]?.endIndex ?? 2) - 1

  const requests: unknown[] = []
  let idx = docEndIndex

  for (const block of blocks) {
    const text = block.text + '\n'
    const start = idx
    const end = idx + text.length
    requests.push({ insertText: { location: { index: start }, text } })
    if (block.style !== 'NORMAL_TEXT') {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: start, endIndex: end },
          paragraphStyle: { namedStyleType: block.style },
          fields: 'namedStyleType',
        },
      })
    }
    if (block.bold) {
      requests.push({
        updateTextStyle: {
          range: { startIndex: start, endIndex: end - 1 },
          textStyle: { bold: true },
          fields: 'bold',
        },
      })
    }
    idx = end
  }

  const batchRes = await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  })
  if (!batchRes.ok) throw new Error(`Google Docs batchUpdate error: ${await batchRes.text()}`)
}

async function createGoogleDoc(
  accessToken: string,
  title: string,
  blocks: DocBlock[],
  folderId?: string
): Promise<string> {
  const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  if (!createRes.ok) throw new Error(`Google Docs create error: ${await createRes.text()}`)

  const { documentId } = await createRes.json() as { documentId: string }

  const requests: unknown[] = []
  let idx = 1

  for (const block of blocks) {
    const text = block.text + '\n'
    const start = idx
    const end = idx + text.length
    requests.push({ insertText: { location: { index: start }, text } })
    if (block.style !== 'NORMAL_TEXT') {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: start, endIndex: end },
          paragraphStyle: { namedStyleType: block.style },
          fields: 'namedStyleType',
        },
      })
    }
    if (block.bold) {
      requests.push({
        updateTextStyle: {
          range: { startIndex: start, endIndex: end - 1 },
          textStyle: { bold: true },
          fields: 'bold',
        },
      })
    }
    idx = end
  }

  const batchRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  })
  if (!batchRes.ok) throw new Error(`Google Docs batchUpdate error: ${await batchRes.text()}`)

  if (folderId) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${documentId}?addParents=${folderId}&fields=id`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
  }

  return `https://docs.google.com/document/d/${documentId}/edit`
}

// ── Messaging system prompt ─────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior B2B outbound copywriter specializing in cold email messaging frameworks.
Your job is to produce per-cell messaging output for a campaign matrix. Each cell is a unique combination of solution × ICP × vertical × persona.

Output ONLY a valid JSON array. No markdown, no preamble, no explanation.

CRITICAL RULES:
- Each bullet in hook_frameworks MUST start with a verb from persona_start_verbs[persona_key]
- Use vertical_customer_terms[vertical_key] for the "customer" (never use "customers" generically)
- Use vertical_expert_terms[vertical_key] for the expert/operator destination
- Use value_prop_formula.product_mechanism and product_ai_component EXACTLY as given — do not paraphrase
- hook_frameworks must include BOTH "ERIC" and "HUIDIG" styles for each cell
- ERIC = action-outcome-mechanism (what you do, what you get, how it works)
- HUIDIG = product-feature focus (what the product does right now, specific capability)
- Each bullet: 10-18 words maximum
- cta_directions: ALWAYS exactly ["info_send", "case_study_send"] — locked during H1/F1, no exceptions
- No subject lines, no full email copy — this is a briefing layer only
- Do NOT prioritize cells — provide messaging for ALL cells in the input
- Each cell has specific grammar constraints in the "PER-CELL GRAMMAR CONSTRAINTS" section — FOLLOW them exactly; banned adjectives listed per cell MUST NOT appear in any bullet, and required phrases per cell bullet grammar MUST be present

Output schema (JSON array):
[
  {
    "cell_code": "exact cell_code from input",
    "solution_key": "...",
    "icp_key": "...",
    "vertical_key": "...",
    "persona_key": "...",
    "hook_frameworks": [
      {
        "style": "ERIC",
        "bullets": [
          "Verb + specific outcome + via product_mechanism + to expert_term",
          "Route/Match/Automate + customer_term + via mechanism + based on signal",
          "Scale/Deliver/Cut + result + without vertical_pain + using product_ai_component"
        ]
      },
      {
        "style": "HUIDIG",
        "bullets": [
          "Verb + what the product does + specific capability + for this vertical",
          "Verb + observable input + automatic action + measurable output",
          "Verb + customer_term + through mechanism + without manual step"
        ]
      }
    ],
    "cta_directions": ["info_send", "case_study_send"],
    "trigger_alignment": ["trigger_event_class1", "trigger_event_class2"],
    "signal_to_pain_mapping": "One sentence: what observable signal indicates this pain for this cell",
    "proof_angle": "Which proof assets to use and how for this vertical/persona combo",
    "objection_angle": "Most likely objection from this persona and how to pre-empt it",
    "notes": ""
  }
]`

// ── Build user prompt ───────────────────────────────────────────────────────

interface CellInput {
  cell_code: string
  solution_key: string
  icp_key: string
  vertical_key: string
  persona_key: string
  trigger_event_classes: string[]
  estimated_addressable_accounts: number | null
  sourcing_findings_summary: string | null
  brief: Record<string, unknown>
}

function buildUserPrompt(
  synthesis: Record<string, unknown>,
  cells: CellInput[]
): string {
  const personaMap = (synthesis.persona_map as Array<Record<string, unknown>>) ?? []
  const personaStartVerbs = (synthesis.persona_start_verbs as Record<string, string[]>) ?? {}
  const verticalMap = (synthesis.vertical_map as Array<Record<string, unknown>>) ?? []
  const verticalCustomerTerms = (synthesis.vertical_customer_terms as Record<string, string>) ?? {}
  const verticalExpertTerms = (synthesis.vertical_expert_terms as Record<string, string>) ?? {}
  const valuePropFormula = (synthesis.value_prop_formula as Record<string, unknown>) ?? {}
  const proofAssets = (synthesis.proof_assets as Array<Record<string, unknown>>) ?? []
  const messagingDirection = (synthesis.messaging_direction as Record<string, string>) ?? {}

  return `
## COMPANY THESIS
${synthesis.company_thesis || ''}

## VALUE PROP FORMULA (use these exact terms)
Product mechanism: ${valuePropFormula.product_mechanism || ''}
Product AI component: ${valuePropFormula.product_ai_component || ''}
Bullet 1 pattern: ${valuePropFormula.bullet_1_pattern || ''}
Bullet 2 pattern: ${valuePropFormula.bullet_2_pattern || ''}
Bullet 3 pattern: ${valuePropFormula.bullet_3_pattern || ''}
Word count target: ${valuePropFormula.word_count_target || 65}

## PERSONA MAP
${personaMap.map(p => `${p.key}: ${p.label}
  Focus themes: ${(p.focus_themes as string[] ?? []).join(', ')}
  Owns metric: ${p.owns_metric}
  Primary pain: ${p.primary_pain}
  Start verbs: ${(personaStartVerbs[p.key as string] ?? []).join(', ')}`).join('\n\n')}

## VERTICAL MAP
${verticalMap.map(v => `${v.vertical_key}: customer_term="${verticalCustomerTerms[v.vertical_key as string] ?? v.customer_term}", expert_term="${verticalExpertTerms[v.vertical_key as string] ?? v.expert_term}"
  Vertical pain: ${v.vertical_pain}`).join('\n\n')}

## PROOF ASSETS
${proofAssets.map(p => `[${p.type}] ${p.description} (use for: ${p.use_for})`).join('\n')}

## MESSAGING DIRECTION
Core angle: ${messagingDirection.core_angle || ''}
Proof narrative: ${messagingDirection.proof_narrative || ''}
Tone: ${messagingDirection.tone_instructions || ''}

## CELLS TO GENERATE MESSAGING FOR (${cells.length} sourcing-approved cells)
${JSON.stringify(cells.map(c => ({
    cell_code: c.cell_code,
    solution_key: c.solution_key,
    icp_key: c.icp_key,
    vertical_key: c.vertical_key,
    persona_key: c.persona_key,
    trigger_event_classes: c.trigger_event_classes,
    customer_term: verticalCustomerTerms[c.vertical_key] ?? null,
    expert_term: verticalExpertTerms[c.vertical_key] ?? null,
    persona_verbs: personaStartVerbs[c.persona_key] ?? [],
    estimated_addressable_accounts: c.estimated_addressable_accounts,
    sourcing_findings_summary: c.sourcing_findings_summary,
  })), null, 2)}

## PER-CELL GRAMMAR CONSTRAINTS
${cells.map(c => {
    try {
      const resolved = resolveFormula({
        persona_key: c.persona_key as Parameters<typeof resolveFormula>[0]['persona_key'],
        vertical_key: c.vertical_key as Parameters<typeof resolveFormula>[0]['vertical_key'],
        signal_tier: 3 as const,
        archetype: 'matrix_driven',
        synthesis_context: {
          proof_assets: proofAssets as Array<{ type: string; description: string; use_for: string }>,
          company_thesis: synthesis.company_thesis as string,
        },
      })
      return `[${c.cell_code}]
${resolved.system_prompt_constraints}`
    } catch {
      return `[${c.cell_code}] (constraints unavailable)`
    }
  }).join('\n')}

Now produce the complete per-cell messaging JSON array. Include ALL ${cells.length} cells.`.trim()
}

// ── Doc block builder ────────────────────────────────────────────────────────

function buildMessagingDocBlocks(
  clientCode: string,
  messagingCells: Array<Record<string, unknown>>,
  generatedAt: string
): DocBlock[] {
  const blocks: DocBlock[] = [
    { style: 'HEADING_1', text: `FASE 2: MESSAGING FRAMEWORK — ${clientCode.toUpperCase()}` },
    { style: 'NORMAL_TEXT', text: `Generated: ${generatedAt}` },
    { style: 'NORMAL_TEXT', text: `Cells: ${messagingCells.length}` },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'HEADING_2', text: 'REVIEW INSTRUCTIONS' },
    { style: 'NORMAL_TEXT', text: 'Each cell below contains two hook frameworks (ERIC and HUIDIG).' },
    { style: 'NORMAL_TEXT', text: 'After approval, messaging is written into campaign_cells.brief automatically.' },
    { style: 'NORMAL_TEXT', text: `POST /functions/v1/gtm-approve  { "client_id": "<uuid>", "action": "messaging_approve" }` },
    { style: 'NORMAL_TEXT', text: '' },
  ]

  messagingCells.forEach((cell, idx) => {
    blocks.push(
      { style: 'HEADING_1', text: `CELL ${idx + 1}: ${cell.cell_code}` },
      { style: 'NORMAL_TEXT', text: `Solution: ${cell.solution_key} | ICP: ${cell.icp_key} | Vertical: ${cell.vertical_key} | Persona: ${cell.persona_key}` },
      { style: 'NORMAL_TEXT', text: '' },
    )

    const hookFrameworks = (cell.hook_frameworks as Array<Record<string, unknown>>) ?? []
    hookFrameworks.forEach(hf => {
      blocks.push({ style: 'HEADING_2', text: `${hf.style} FRAMEWORK` })
      const bullets = (hf.bullets as string[]) ?? []
      bullets.forEach((b, i) => blocks.push({ style: 'NORMAL_TEXT', text: `${i + 1}. ${b}` }))
      blocks.push({ style: 'NORMAL_TEXT', text: '' })
    })

    blocks.push(
      { style: 'NORMAL_TEXT', text: `CTA: ${(cell.cta_directions as string[] ?? []).join(' | ')}`, bold: true },
      { style: 'NORMAL_TEXT', text: `Triggers: ${(cell.trigger_alignment as string[] ?? []).join(' | ')}` },
      { style: 'NORMAL_TEXT', text: `Signal → Pain: ${cell.signal_to_pain_mapping || ''}` },
      { style: 'NORMAL_TEXT', text: `Proof angle: ${cell.proof_angle || ''}` },
      { style: 'NORMAL_TEXT', text: `Objection: ${cell.objection_angle || ''}` },
    )
    if (cell.notes) blocks.push({ style: 'NORMAL_TEXT', text: `Notes: ${cell.notes}` })
    blocks.push({ style: 'NORMAL_TEXT', text: '' })
  })

  return blocks
}

// ── Main handler ────────────────────────────────────────────────────────────

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

    // Read client metadata
    const { data: client, error: fetchError } = await supabase
      .from('clients')
      .select('id, name, client_code, workflow_metrics, gtm_execution_review_doc_url')
      .eq('id', client_id)
      .single()

    if (fetchError || !client) {
      return new Response(
        JSON.stringify({ success: false, error: `Client not found: ${fetchError?.message}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Read synthesis from gtm_strategies (primary source)
    const { data: strategyRow, error: strategyError } = await supabase
      .from('gtm_strategies')
      .select('id, synthesis')
      .eq('client_id', client_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (strategyError || !strategyRow?.synthesis) {
      return new Response(
        JSON.stringify({ success: false, error: 'GTM synthesis not yet available' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const synthesis = strategyRow.synthesis as Record<string, unknown>

    // Read cells that passed sourcing (sourcing_pending = passed gate, sourcing_failed = excluded)
    // At messaging time, cells that passed sourcing are still in sourcing_pending status.
    // Cells already enriched (ready) are also included to support re-runs.
    const { data: cells, error: cellsError } = await supabase
      .from('campaign_cells')
      .select('cell_code, solution_key, icp_key, vertical_key, persona_key, brief, status')
      .eq('client_id', client_id)
      .in('status', ['sourcing_pending', 'ready'])

    if (cellsError) {
      return new Response(
        JSON.stringify({ success: false, error: `Failed to fetch cells: ${cellsError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!cells || cells.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No sourcing-approved cells found — ensure gtm-aleads-source ran and sourcing was approved' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const cellInputs: CellInput[] = cells.map(c => {
      const brief = (c.brief as Record<string, unknown>) ?? {}
      return {
        cell_code: c.cell_code,
        solution_key: c.solution_key,
        icp_key: c.icp_key,
        vertical_key: c.vertical_key,
        persona_key: c.persona_key,
        trigger_event_classes: (brief.trigger_event_classes as string[]) ?? [],
        estimated_addressable_accounts: (brief.estimated_addressable_accounts as number | null) ?? null,
        sourcing_findings_summary: (brief.sourcing_findings_summary as string | null) ?? null,
        brief,
      }
    })

    const wm = (client.workflow_metrics as Record<string, unknown>) ?? {}
    const messagingApproval = (wm.messaging_approval as Record<string, unknown>) ?? {}
    const currentAttempts = (messagingApproval.attempts as number) ?? 0
    const isRevision = messagingApproval.status === 'rejected'
    const now = new Date().toISOString()

    console.log(`[${requestId}] Generating messaging for client ${client_id}: ${cellInputs.length} cells, attempt ${currentAttempts + 1}`)

    const userPrompt = buildUserPrompt(synthesis, cellInputs)

    const chatResponse = await fetch(`${KIMI_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${KIMI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MESSAGING_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 12000,
        temperature: 0.3,
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
      choices?: Array<{ message: { content: string } }>
    }

    const rawContent = chatData.choices?.[0]?.message?.content
    if (!rawContent) {
      return new Response(
        JSON.stringify({ success: false, error: 'LLM returned empty response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let messagingCells: Array<Record<string, unknown>>
    try {
      const jsonMatch = rawContent.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || rawContent.match(/(\[[\s\S]*\])/)
      const jsonStr = jsonMatch ? jsonMatch[1] : rawContent
      messagingCells = JSON.parse(jsonStr)
      if (!Array.isArray(messagingCells)) throw new Error('Expected JSON array')
    } catch {
      console.error(`[${requestId}] Failed to parse LLM JSON output`)
      return new Response(
        JSON.stringify({ success: false, error: 'LLM output is not a valid JSON array', raw: rawContent.substring(0, 500) }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Append fase 2 to Execution Review doc (or create standalone fallback) ─
    const oauthConfigJson = Deno.env.get('GOOGLE_OAUTH_CONFIG')
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    const googleFolderId = Deno.env.get('GOOGLE_DRIVE_FOLDER_ID')
    const googleConfigured = !!(oauthConfigJson || serviceAccountJson)

    const clientCode = String((client as Record<string, unknown>).client_code ?? client.name ?? 'CLIENT')
    const existingDocUrl = String((client as Record<string, unknown>).gtm_execution_review_doc_url ?? '')
    let docUrl: string | null = existingDocUrl || null

    if (googleConfigured) {
      const blocks = buildMessagingDocBlocks(clientCode, messagingCells, now)

      try {
        const accessToken = oauthConfigJson
          ? await getGoogleAccessToken(oauthConfigJson)
          : await getGoogleAccessTokenFromServiceAccount(serviceAccountJson!)

        const existingDocId = existingDocUrl ? extractDocId(existingDocUrl) : null

        if (existingDocId) {
          // Append fase 2 section to existing Execution Review doc
          await appendToDoc(accessToken, existingDocId, blocks)
          console.log(`[${requestId}] Fase 2 messaging appended to existing doc: ${existingDocUrl}`)
          docUrl = existingDocUrl
        } else {
          // No execution review doc yet — create standalone messaging doc as fallback
          const title = `${clientCode} | Execution Review`
          docUrl = await createGoogleDoc(accessToken, title, blocks, googleFolderId)
          console.log(`[${requestId}] Standalone messaging doc created: ${docUrl}`)
        }
      } catch (err) {
        console.error(`[${requestId}] Google Doc operation failed:`, (err as Error).message)
      }
    } else {
      console.warn(`[${requestId}] Google auth not configured — skipping doc operation`)
    }

    // ── Store messaging output in workflow_metrics ──────────────────────────
    const updatedWm = {
      ...wm,
      messaging_approval: {
        ...messagingApproval,
        status: 'pending',
        started_at: messagingApproval.started_at ?? now,
        attempts: isRevision ? currentAttempts + 1 : Math.max(currentAttempts, 1),
        decided_at: null,
        last_feedback: messagingApproval.last_feedback ?? null,
        cell_count: messagingCells.length,
      },
      messaging_output: messagingCells,  // Per-cell messaging — read by gtm-campaign-cell-enrich
    }

    const updatePayload: Record<string, unknown> = {
      stage: 'messaging_approval',
      workflow_metrics: updatedWm,
    }
    // messaging_doc_url points to the Execution Review doc (same doc, fase 2 appended)
    if (docUrl) {
      updatePayload.messaging_doc_url = docUrl
      if (!existingDocUrl) updatePayload.gtm_execution_review_doc_url = docUrl
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

    // ── Notify via Slack ────────────────────────────────────────────────────
    const slackBotToken = Deno.env.get('SLACK_BOT_TOKEN')
    const slackChannel = Deno.env.get('SLACK_TEST_CHANNEL')

    if (slackBotToken && slackChannel) {
      fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${slackBotToken}` },
        body: JSON.stringify({
          channel: slackChannel,
          text: `Messaging framework ready for review: ${client.name}`,
          blocks: [{
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Messaging Framework — Review Required*\n\nClient: *${client.name}*\nCells: ${messagingCells.length}\n${docUrl ? `Doc: ${docUrl}\n` : ''}
Approve via:
\`\`\`POST /functions/v1/gtm-approve
{ "client_id": "${client_id}", "action": "messaging_approve" }\`\`\``,
            },
          }],
        }),
      }).catch(err => console.error(`[${requestId}] Slack notify failed:`, err.message))
    }

    console.log(`[${requestId}] Messaging doc generated for client ${client_id}: ${messagingCells.length} cells`)

    return new Response(
      JSON.stringify({
        success: true,
        client_id,
        cells_generated: messagingCells.length,
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
