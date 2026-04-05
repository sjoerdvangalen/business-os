import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const EXPECTED_FORM_ID = "260936013165049"
const JOTFORM_API_KEY = Deno.env.get('JOTFORM_API_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Field mapping: Jotform q-field → canonical dot-path ──────────────────────
const FIELD_MAP: Record<string, string> = {
  q3_textbox1:    'company_basics.company_name',
  q4_textbox2:    'company_basics.website',
  q5_textbox3:    'company_basics.main_contact_name',   // removed from form — kept for backward compat
  q7_email5:      'company_basics.main_contact_email',  // removed from form — kept for backward compat
  q9_textarea7:   'scope_and_priority.solutions_text',
  q10_textarea8:  'scope_and_priority.priority_solution_text',
  q18_textarea16: 'icp_constraints.icp_segments_text',
  q19_textarea17: 'icp_constraints.hard_disqualifiers_text',
  q46_whatAre46:  'icp_constraints.must_have_criteria_text',
  q43_whatAre:    'buyer_scope.target_personas_text',
  q22_textarea20: 'buyer_scope.excluded_personas_text',
  q30_textarea28: 'proof_and_claims.allowed_proof_text',
  q31_textarea29: 'proof_and_claims.disallowed_proof_text',
  q32_textarea30: 'proof_and_claims.allowed_claims_text',
  q33_textarea31: 'proof_and_claims.disallowed_claims_text',
  q34_textarea32: 'messaging_boundaries.preferred_tone',
  q35_textarea33: 'messaging_boundaries.avoid_tone',
  q36_textarea34: 'messaging_boundaries.compliance_restrictions',
  q41_textarea39: 'misc_notes',
  q47_typeA:      'integrations.crm_platform',
  q48_typeA48:    'integrations.crm_api_key',
  q49_typeA49:    'integrations.calendar_platform',
  q50_typeA50:    'integrations.calendar_api_key',
}

const FILE_FIELDS: Record<string, string> = {
  q38_fileupload36: 'assets.dnc_files',
  q39_fileupload37: 'assets.sales_assets_files',
  q40_fileupload38: 'assets.outbound_examples_files',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeDomain(input: string): string {
  if (!input) return ''
  return input
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .split('?')[0]
    .trim()
}

// Set a value on a nested object via dot-path ('a.b.c')
function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.')
  let cursor = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (typeof cursor[key] !== 'object' || cursor[key] === null) {
      cursor[key] = {}
    }
    cursor = cursor[key] as Record<string, unknown>
  }
  cursor[keys[keys.length - 1]] = value
}

function buildEmptyContract(): Record<string, unknown> {
  return {
    version: 1,
    company_basics: {
      company_name: '',
      website: '',
      main_contact_name: '',
      main_contact_email: '',
    },
    scope_and_priority: {
      solutions_text: '',
      priority_solution_text: '',
    },
    icp_constraints: {
      icp_segments_text: '',
      must_have_criteria_text: '',
      hard_disqualifiers_text: '',
    },
    buyer_scope: {
      target_personas_text: '',
      excluded_personas_text: '',
    },
    proof_and_claims: {
      allowed_proof_text: '',
      disallowed_proof_text: '',
      allowed_claims_text: '',
      disallowed_claims_text: '',
    },
    messaging_boundaries: {
      preferred_tone: '',
      avoid_tone: '',
      compliance_restrictions: '',
    },
    misc_notes: '',
    integrations: {
      crm_platform: '',
      crm_api_key: '',
      calendar_platform: '',
      calendar_api_key: '',
    },
    assets: {
      dnc_files: [],
      sales_assets_files: [],
      outbound_examples_files: [],
    },
    meta: {
      form_provider: 'jotform',
      form_id: EXPECTED_FORM_ID,
      submission_id: '',
      submitted_at: '',
    },
  }
}

// Parse Jotform file upload field — returns array of file metadata
// Handles both plain URL strings and objects with url/filename/size
function parseFileField(value: unknown): Array<{ url: string; filename: string; size: number }> {
  if (!value) return []
  const files = Array.isArray(value) ? value : [value]
  return files
    .filter(Boolean)
    .map((f: unknown) => {
      let rawUrl = ''
      let filename = ''
      if (typeof f === 'string') {
        rawUrl = f
        filename = rawUrl.split('/').pop()?.split('?')[0] || ''
      } else {
        const fo = f as Record<string, unknown>
        rawUrl = (fo.url || fo.fileUrl || '') as string
        filename = (fo.filename || fo.name || rawUrl.split('/').pop()?.split('?')[0] || '') as string
      }
      // Append API key so stored URLs are directly downloadable
      const url = rawUrl && JOTFORM_API_KEY
        ? `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}apiKey=${JOTFORM_API_KEY}`
        : rawUrl
      return { url, filename, size: 0 }
    })
    .filter(f => f.url || f.filename)
}

// Apply scalar field mapping
function applyFieldMap(
  raw: Record<string, unknown>,
  contract: Record<string, unknown>
): void {
  for (const [field, path] of Object.entries(FIELD_MAP)) {
    const value = raw[field]
    if (value !== undefined && value !== null) {
      setPath(contract, path, String(value).trim())
    }
  }
}

// Apply file field mapping
function applyFileFields(
  raw: Record<string, unknown>,
  contract: Record<string, unknown>
): void {
  for (const [field, path] of Object.entries(FILE_FIELDS)) {
    const value = raw[field]
    setPath(contract, path, parseFileField(value))
  }
}

// Parse Jotform webhook body (handles JSON and form-encoded with rawRequest)
async function parseJotformBody(req: Request): Promise<Record<string, unknown>> {
  const contentType = req.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const body = await req.json()
    // If rawRequest is present as a JSON string, use it as answers
    if (typeof body.rawRequest === 'string') {
      try {
        const answers = JSON.parse(body.rawRequest)
        return { ...answers, formID: body.formID, submissionID: body.submissionID }
      } catch { /* fall through */ }
    }
    return body
  }

  // form-encoded
  const text = await req.text()
  const params = new URLSearchParams(text)
  const result: Record<string, unknown> = {}
  for (const [k, v] of params.entries()) {
    result[k] = v
  }

  // rawRequest may be a JSON string embedded in form body
  if (typeof result.rawRequest === 'string') {
    try {
      const answers = JSON.parse(result.rawRequest as string)
      return { ...answers, formID: result.formID, submissionID: result.submissionID }
    } catch { /* fall through */ }
  }

  return result
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ status: 'ok', service: 'webhook-jotform-intake' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // ── 1. Auth check ────────────────────────────────────────────────────────
  const webhookSecret = Deno.env.get('JOTFORM_WEBHOOK_SECRET')
  if (webhookSecret) {
    const url = new URL(req.url)
    const providedSecret = url.searchParams.get('secret')
    if (!providedSecret || providedSecret !== webhookSecret) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

  try {
    // ── 2. Parse body ──────────────────────────────────────────────────────
    const raw = await parseJotformBody(req)
    console.log(`[${requestId}] Jotform intake received:`, JSON.stringify(raw).substring(0, 300))

    // ── 3. Validate ────────────────────────────────────────────────────────
    const submissionId = (raw.submissionID || raw.submission_id || '') as string
    const formId = (raw.formID || raw.form_id || '') as string

    if (!submissionId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing submissionID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (formId && formId !== EXPECTED_FORM_ID) {
      return new Response(
        JSON.stringify({ success: false, error: `Unexpected formID: ${formId}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── 4. Normalize ───────────────────────────────────────────────────────
    const contract = buildEmptyContract()
    applyFieldMap(raw, contract)
    applyFileFields(raw, contract)

    // Fill meta
    setPath(contract, 'meta.submission_id', submissionId)
    setPath(contract, 'meta.form_id', formId || EXPECTED_FORM_ID)
    setPath(contract, 'meta.submitted_at', new Date().toISOString())

    const companyName = (contract as Record<string, Record<string, string>>)
      .company_basics.company_name
    const websiteRaw = (contract as Record<string, Record<string, string>>)
      .company_basics.website
    const contactEmail = (contract as Record<string, Record<string, string>>)
      .company_basics.main_contact_email
    const domain = normalizeDomain(websiteRaw)

    // ── 5. Client matching (conservative: domain only) ─────────────────────
    let clientId: string | null = null
    let intakeStatus = 'form_submitted'

    if (domain) {
      // Normalize all clients.domain values for comparison
      const { data: allClients } = await supabase
        .from('clients')
        .select('id, domain')
        .not('domain', 'is', null)

      const match = (allClients || []).find(
        c => normalizeDomain(c.domain) === domain
      )

      if (match) {
        clientId = match.id
        console.log(`[${requestId}] Client matched by domain: ${domain} → ${clientId}`)
      }
    }

    if (!clientId) {
      // No domain match → create new client, flag for review
      intakeStatus = 'review_required'
      console.log(`[${requestId}] No domain match for '${domain}' — creating new client`)

      const { data: newClient, error: createError } = await supabase
        .from('clients')
        .insert({
          name: companyName || domain || 'Unknown',
          domain: domain || null,
        })
        .select('id')
        .single()

      if (createError || !newClient) {
        console.error(`[${requestId}] Failed to create client:`, createError?.message)
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to create client record' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      clientId = newClient.id
      console.log(`[${requestId}] New client created: ${clientId} (review_required)`)
    }

    // ── 6. Update client ───────────────────────────────────────────────────
    const { error: updateError } = await supabase
      .from('clients')
      .update({
        onboarding_form: contract,
        onboarding_form_raw: raw,
        intake_status: intakeStatus,
        last_intake_at: new Date().toISOString(),
        ...(contactEmail ? { primary_contact_email: contactEmail } : {}),
      })
      .eq('id', clientId)

    if (updateError) {
      console.error(`[${requestId}] Failed to update client:`, updateError.message)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update client record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[${requestId}] Intake stored: client=${clientId} status=${intakeStatus} submission=${submissionId}`)

    return new Response(
      JSON.stringify({
        success: true,
        client_id: clientId,
        intake_status: intakeStatus,
        submission_id: submissionId,
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
