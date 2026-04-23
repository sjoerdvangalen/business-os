/**
 * GTM Execution Review — ported from Supabase edge function
 * Generates keyword profiles, A-Leads previews, and creates Google Doc
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const KIMI_API_KEY = process.env.KIMI_API_KEY ?? '';
const KIMI_BASE_URL = (process.env.KIMI_BASE_URL || 'https://api.kimi.com').replace(/\/$/, '');
const KIMI_MODEL = 'kimi-k2-turbo-preview';

const ALEADS_EMAIL = process.env.ALEADS_EMAIL ?? '';
const ALEADS_PASSWORD = process.env.ALEADS_PASSWORD ?? '';
const MIN_ADDRESSABLE_COMPANIES = 10;

interface OAuthConfig {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  token_uri: string;
}

async function getGoogleAccessToken(oauthConfigJson: string): Promise<string> {
  const config: OAuthConfig = JSON.parse(oauthConfigJson);
  const tokenRes = await fetch(config.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.client_id,
      client_secret: config.client_secret,
      refresh_token: config.refresh_token,
    }),
  });
  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Google OAuth error: ${err}`);
  }
  const tokenData = await tokenRes.json() as { access_token: string };
  return tokenData.access_token;
}

async function getGoogleAccessTokenFromServiceAccount(serviceAccountJson: string): Promise<string> {
  const serviceAccount = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const payload = btoa(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const pemBody = serviceAccount.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '');
  const keyBuffer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey(
    'pkcs8', keyBuffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const signingInput = `${header}.${payload}`;
  const signatureBuffer = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(signingInput));
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const jwt = `${signingInput}.${signature}`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!tokenRes.ok) throw new Error(`Google OAuth error: ${await tokenRes.text()}`);
  const tokenData = await tokenRes.json() as { access_token: string };
  return tokenData.access_token;
}

interface DocBlock {
  style: 'HEADING_1' | 'HEADING_2' | 'HEADING_3' | 'NORMAL_TEXT';
  text: string;
  bold?: boolean;
}

async function createRichDoc(
  accessToken: string,
  title: string,
  blocks: DocBlock[],
  folderId?: string
): Promise<string> {
  const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!createRes.ok) throw new Error(`Google Docs create error: ${await createRes.text()}`);
  const { documentId } = await createRes.json() as { documentId: string };
  const requests: unknown[] = [];
  let idx = 1;
  for (const block of blocks) {
    const text = block.text + '\n';
    const start = idx;
    const end = idx + text.length;
    requests.push({ insertText: { location: { index: start }, text } });
    if (block.style !== 'NORMAL_TEXT') {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: start, endIndex: end },
          paragraphStyle: { namedStyleType: block.style },
          fields: 'namedStyleType',
        },
      });
    }
    if (block.bold) {
      requests.push({
        updateTextStyle: {
          range: { startIndex: start, endIndex: end - 1 },
          textStyle: { bold: true },
          fields: 'bold',
        },
      });
    }
    idx = end;
  }
  const batchRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (!batchRes.ok) throw new Error(`Google Docs batchUpdate error: ${await batchRes.text()}`);
  if (folderId) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${documentId}?addParents=${folderId}&fields=id`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
  }
  return `https://docs.google.com/document/d/${documentId}/edit`;
}

async function loginALeads(email: string, password: string): Promise<string> {
  const resp = await fetch('https://app.a-leads.co/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://app.a-leads.co',
      'x-host-domain': 'app.a-leads.co',
    },
    body: JSON.stringify({ email, password, rememberMe: true }),
  });
  const setCookie = resp.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/access_token=([^;]+)/);
  if (!match) throw new Error('A-Leads login failed — no access_token in set-cookie');
  return match[1];
}

function aleadsHeaders(token: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Cookie': `access_token=${token}`,
    'Origin': 'https://app.a-leads.co',
    'x-host-domain': 'app.a-leads.co',
  };
}

function geoToHqLocation(geo: unknown): string[] {
  const map: Record<string, string[]> = {
    NL: ['netherlands'],
    BE: ['belgium'],
    NLBE: ['netherlands', 'belgium'],
    DACH: ['germany', 'austria', 'switzerland'],
    UK: ['united kingdom'],
    DE: ['germany'],
    AT: ['austria'],
    CH: ['switzerland'],
  };
  if (Array.isArray(geo)) return geo.flatMap((g: string) => map[g] ?? [g.toLowerCase()]);
  return map[geo as string] ?? [(geo as string ?? '').toLowerCase()];
}

function employeeRangeToSizeCodes(range: string): string[] {
  if (!range) return ['3', '4', '5'];
  const parts = range.split('-').map(s => parseInt(s.replace(/[k+]/gi, '000')));
  const min = parts[0] || 0;
  const max = parts[1] || Infinity;
  const ranges: [number, number, string][] = [
    [1, 10, '1'], [11, 20, '2'], [21, 50, '3'], [51, 100, '4'],
    [101, 200, '5'], [201, 500, '6'], [501, 1000, '7'], [1001, 5000, '8'], [5001, 999999, '9'],
  ];
  const codes = ranges.filter(([lo, hi]) => min <= hi && max >= lo).map(([, , c]) => c);
  return codes.length ? codes : ['3', '4', '5'];
}

function buildALeadsPreviewUrl(type: 'company' | 'contact', params: {
  categories_and_keywords: string[];
  hq_location: string[];
  mapped_company_size: string[];
  job_titles?: string[];
}): string {
  const base = type === 'company'
    ? 'https://app.a-leads.co/app/search/company-search'
    : 'https://app.a-leads.co/app/search/advanced-search';
  const parts = [
    '__showIncludedCompanyKeywords=true',
    '__company_keyword_include_name=true',
    '__company_keyword_include_desc=true',
    '__showExcludedCompanyKeywords=false',
    '__showExcludedTechnologies=false',
    ...params.categories_and_keywords.slice(0, 10).map(k => `categories_and_keywords[]=${encodeURIComponent(k)}`),
    ...params.hq_location.map(l => `hq_location[]=${encodeURIComponent(l)}`),
    ...params.mapped_company_size.map(s => `mapped_company_size[]=${s}`),
  ];
  if (params.job_titles?.length) {
    parts.push(...params.job_titles.slice(0, 10).map(t => `job_title[]=${encodeURIComponent(t)}`));
  }
  return `${base}#${parts.join('&')}`;
}

const KEYWORD_PROFILING_SYSTEM_PROMPT = `# SYSTEM INSTRUCTION — JOB TITLE / KEYWORD PROFILING

## Core rule
Voor elke request moet het systeem altijd een profiel bouwen.
Een profiel bestaat uit: Naam (logisch, samenhangend, commercieel bruikbaar), Keyword set (30–60 termen), Komma-gescheiden output, Multi-language uitbreiding (indien relevant)

## Profiel naamgeving
Format: [Primary Function] + [Context] + [Use Case]
Voorbeelden: Revenue Leadership B2B Pipeline, Demand Generation Growth Teams, Logistics & Construction Operators

## Keyword structuur
- 30–60 termen
- komma-gescheiden
- synoniemen, varianten, functietitels of industrie keywords, alternatieve schrijfwijzen
- GEEN korte lijstjes, GEEN duplicaten, GEEN losse bullets

## Taalregels
- Altijd Engels inbegrepen
- Indien EU targeting: voeg automatisch toe: Nederlands (NL), Frans (FR), Duits (DE), Spaans (ES) indien relevant

## A-Leads structuur (verplicht)
- platte komma-gescheiden string
- geen markdown in de lijst zelf
- geen extra tekens
- geen line breaks binnen de lijst

## Output format (verplicht)
### Profiel naam
[Naam]

### Keywords (comma separated)
keyword1, keyword2, keyword3, ...

## Kwaliteitsregels
Variatie toevoegen (geen herhaling)
Synoniemen gebruiken
Internationale termen meenemen
Realistische job titles / industry termen gebruiken
Denken in hoe bedrijven zichzelf omschrijven`;

interface KeywordProfile {
  profile_name: string;
  keywords: string;
}

function parseKeywordProfileResponse(text: string): KeywordProfile {
  const nameMatch = text.match(/###\s*Profiel naam\s*\n([^\n]+)/i)
    ?? text.match(/\*\*Profiel naam\*\*:?\s*\n?([^\n]+)/i)
    ?? text.match(/Profile name:?\s*([^\n]+)/i);
  const kwMatch = text.match(/###\s*Keywords.*?\n([^\n]+)/i)
    ?? text.match(/\*\*Keywords.*?\*\*:?\s*\n?([^\n]+)/i)
    ?? text.match(/Keywords?:?\s*([^\n]{30,})/i);
  const profile_name = nameMatch?.[1]?.trim() ?? 'Unnamed Profile';
  const keywords = kwMatch?.[1]?.trim() ?? text.split('\n').filter(l => l.includes(',')).join(', ');
  return { profile_name, keywords };
}

async function generateKeywordProfile(
  type: 'industry' | 'job_title',
  segment: Record<string, unknown>,
  synthesis: Record<string, unknown>,
  requestId: string
): Promise<KeywordProfile> {
  const icpName = String(segment.name ?? '');
  const geo = String(segment.geo ?? '');
  const employeeRange = String(segment.employee_range ?? '');
  const industries = ((segment.industries as string[]) ?? []).join(', ');
  const companyThesis = String(synthesis.company_thesis ?? '');
  const solutions = (synthesis.solutions as Array<Record<string, unknown>> ?? [])
    .map(s => String(s.name ?? s.solution_name ?? '')).filter(Boolean).join(', ');
  const matrixSeed = (synthesis.campaign_matrix_seed as Array<Record<string, unknown>>) ?? [];
  const icpKey = String(segment.key ?? '');
  const relatedPersonaKeys = [...new Set(
    matrixSeed
      .filter(c => c.icp_key === icpKey && c.valid === true)
      .map(c => String(c.persona_key ?? ''))
      .filter(Boolean)
  )];
  const personaMap = (synthesis.persona_map as Array<Record<string, unknown>>) ?? [];
  const personaLabels = relatedPersonaKeys
    .map(pk => {
      const p = personaMap.find(pm => pm.key === pk);
      return p ? String(p.label ?? pk) : pk;
    })
    .join(', ');
  const focusThemes = relatedPersonaKeys.flatMap(pk => {
    const p = personaMap.find(pm => pm.key === pk);
    return (p?.focus_themes as string[]) ?? [];
  }).filter((v, i, a) => a.indexOf(v) === i).join(', ');

  let userMessage: string;
  if (type === 'industry') {
    userMessage = `Client: ${companyThesis}\nICP Segment: ${icpName} | Geo: ${geo} | Size: ${employeeRange}\nIndustries: ${industries}\nTarget Personas: ${personaLabels} — focus: ${focusThemes}\nSolutions: ${solutions}\n\nGenereer: Industry/company keyword profiel (30-60 termen)`;
  } else {
    userMessage = `Client: ${companyThesis}\nICP Segment: ${icpName} | Geo: ${geo} | Size: ${employeeRange}\nIndustries: ${industries}\nTarget Personas: ${personaLabels} — focus: ${focusThemes}\nSolutions: ${solutions}\n\nGenereer: Job title/persona keyword profiel (30-60 termen) voor de bovengenoemde personas`;
  }

  const resp = await fetch(`${KIMI_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KIMI_API_KEY}`,
    },
    body: JSON.stringify({
      model: KIMI_MODEL,
      messages: [
        { role: 'system', content: KEYWORD_PROFILING_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 2000,
      temperature: 0.3,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Kimi API error ${resp.status}: ${err}`);
  }

  const data = await resp.json() as { choices?: Array<{ message: { content: string } }> };
  const content = data.choices?.[0]?.message?.content ?? '';
  console.log(`[${requestId}] Keyword profile (${type}) generated for ${icpName}: ${content.substring(0, 100)}...`);
  return parseKeywordProfileResponse(content);
}

async function squirrelCompanyPreview(
  token: string,
  industryKeywords: string[],
  hqLocation: string[],
  mappedCompanySize: string[],
  requestId: string
): Promise<number> {
  const kw = industryKeywords.slice(0, 15);
  const filters = {
    categories_and_keywords: kw,
    hq_location: hqLocation,
    mapped_company_size: mappedCompanySize,
    __showIncludedCompanyKeywords: true,
    __company_keyword_include_name: true,
    __company_keyword_include_desc: true,
    __showExcludedCompanyKeywords: false,
    __showExcludedTechnologies: false,
  };
  const parsedFilters = {
    categories_and_keywords: kw,
    hq_location: hqLocation,
    mapped_company_size: mappedCompanySize.map(s => parseInt(s)),
    company_keyword_include_name: true,
    company_keyword_include_desc: true,
  };
  const payload = {
    searchType: 'total',
    exportType: 'company_search',
    name: 'preview',
    filters,
    parsedFilters,
    creditLimit: 10,
    phoneEnrich: false,
    emailEnrich: false,
    personalEmailEnrich: false,
    partialEnrich: false,
    crm: { enabled: false, selectedProfile: null },
    maxPeoplePerCompany: null,
  };
  const resp = await fetch('https://app.a-leads.co/api/tool/squirrel/company-search', {
    method: 'POST',
    headers: aleadsHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    console.error(`[${requestId}] Squirrel company-search error ${resp.status}: ${await resp.text()}`);
    return 0;
  }
  const data = await resp.json() as { metaData?: { totalCount?: number } };
  return data.metaData?.totalCount ?? 0;
}

async function squirrelContactPreview(
  token: string,
  jobTitleKeywords: string[],
  hqLocation: string[],
  mappedCompanySize: string[],
  industryKeywords: string[],
  requestId: string
): Promise<number> {
  const kw = industryKeywords.slice(0, 15);
  const jt = jobTitleKeywords.slice(0, 15);
  const filters = {
    job_title: jt,
    categories_and_keywords: kw,
    hq_location: hqLocation,
    mapped_company_size: mappedCompanySize,
    __showIncludedCompanyKeywords: true,
    __company_keyword_include_name: true,
    __company_keyword_include_desc: true,
    __showExcludedCompanyKeywords: false,
    __showExcludedTechnologies: false,
  };
  const parsedFilters = {
    job_title: jt,
    categories_and_keywords: kw,
    hq_location: hqLocation,
    mapped_company_size: mappedCompanySize.map(s => parseInt(s)),
    company_keyword_include_name: true,
    company_keyword_include_desc: true,
  };
  const payload = {
    searchType: 'total',
    exportType: 'advanced_search',
    name: 'preview',
    filters,
    parsedFilters,
    creditLimit: 10,
    phoneEnrich: false,
    emailEnrich: false,
    personalEmailEnrich: false,
    partialEnrich: false,
    crm: { enabled: false, selectedProfile: null },
    maxPeoplePerCompany: null,
  };
  const resp = await fetch('https://app.a-leads.co/api/tool/squirrel/advanced-search', {
    method: 'POST',
    headers: aleadsHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    console.error(`[${requestId}] Squirrel advanced-search error ${resp.status}: ${await resp.text()}`);
    return 0;
  }
  const data = await resp.json() as { metaData?: { totalCount?: number } };
  return data.metaData?.totalCount ?? 0;
}

function buildExecutionReviewDocBlocks(
  clientCode: string,
  generatedAt: string,
  segmentResults: Array<{
    name: string;
    geo: string;
    employee_range: string;
    industries: string[];
    industryProfileName: string;
    industryKeywords: string;
    estimatedCompanyCount: number;
    companyPreviewUrl: string;
    jobTitleProfileName: string;
    jobTitleKeywords: string;
    estimatedContactCount: number;
    contactPreviewUrl: string;
  }>
): DocBlock[] {
  const blocks: DocBlock[] = [
    { style: 'HEADING_1', text: `EXECUTION REVIEW — ${clientCode.toUpperCase()}` },
    { style: 'NORMAL_TEXT', text: `Generated: ${generatedAt}` },
    { style: 'NORMAL_TEXT', text: `Segments: ${segmentResults.length}` },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'HEADING_2', text: 'REVIEW INSTRUCTIONS' },
    { style: 'NORMAL_TEXT', text: 'Review each segment below. Check keyword relevance, estimated volumes, and preview URLs.' },
    { style: 'NORMAL_TEXT', text: 'After review, approve or reject sourcing via:' },
    { style: 'NORMAL_TEXT', text: `POST /functions/v1/gtm-approve\n{ "client_id": "<uuid>", "action": "sourcing_approve" }` },
    { style: 'NORMAL_TEXT', text: '' },
  ];
  for (const seg of segmentResults) {
    blocks.push(
      { style: 'HEADING_1', text: `SEGMENT: ${seg.name.toUpperCase()}` },
      { style: 'NORMAL_TEXT', text: `Geo: ${seg.geo} | Size: ${seg.employee_range}` },
      { style: 'NORMAL_TEXT', text: `Sectors: ${seg.industries.join(', ')}` },
      { style: 'NORMAL_TEXT', text: '' },
      { style: 'HEADING_2', text: 'Industry Keyword Profile' },
      { style: 'NORMAL_TEXT', text: `Name: ${seg.industryProfileName}`, bold: true },
      { style: 'NORMAL_TEXT', text: `Keywords: ${seg.industryKeywords}` },
      { style: 'NORMAL_TEXT', text: `Estimated companies: ~${seg.estimatedCompanyCount}` },
      { style: 'NORMAL_TEXT', text: `A-Leads Company Preview: ${seg.companyPreviewUrl}` },
      { style: 'NORMAL_TEXT', text: '' },
      { style: 'HEADING_2', text: 'Job Title Keyword Profile' },
      { style: 'NORMAL_TEXT', text: `Name: ${seg.jobTitleProfileName}`, bold: true },
      { style: 'NORMAL_TEXT', text: `Keywords: ${seg.jobTitleKeywords}` },
      { style: 'NORMAL_TEXT', text: `Estimated contacts: ~${seg.estimatedContactCount}` },
      { style: 'NORMAL_TEXT', text: `A-Leads Contact Preview: ${seg.contactPreviewUrl}` },
      { style: 'NORMAL_TEXT', text: '' },
    );
  }
  return blocks;
}

export interface ExecutionReviewOptions {
  client_id: string;
}

export interface ExecutionReviewResult {
  success: boolean;
  client_id?: string;
  strategy_id?: string;
  segments_processed?: number;
  doc_url?: string | null;
  request_id: string;
  error?: string;
}

export async function runExecutionReview(opts: ExecutionReviewOptions): Promise<ExecutionReviewResult> {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  try {
    const { client_id } = opts;
    if (!client_id) {
      return { success: false, error: 'Missing client_id', request_id: requestId };
    }
    if (!KIMI_API_KEY) {
      return { success: false, error: 'KIMI_API_KEY not configured', request_id: requestId };
    }

    const { data: client, error: fetchError } = await supabase
      .from('clients')
      .select('id, name, client_code, workflow_metrics')
      .eq('id', client_id)
      .single();

    if (fetchError || !client) {
      return { success: false, error: `Client not found: ${fetchError?.message}`, request_id: requestId };
    }

    const clientCode = String((client as Record<string, unknown>).client_code ?? client.name ?? 'CLIENT');

    const { data: strategyRow, error: strategyError } = await supabase
      .from('gtm_strategies')
      .select('id, synthesis')
      .eq('client_id', client_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (strategyError || !strategyRow?.synthesis) {
      return { success: false, error: 'GTM synthesis not available', request_id: requestId };
    }

    const synthesis = strategyRow.synthesis as Record<string, unknown>;
    const strategyId = strategyRow.id;
    const icpSegments = (synthesis.icp_segments as Array<Record<string, unknown>>) ?? [];
    const now = new Date().toISOString();

    if (icpSegments.length === 0) {
      return { success: false, error: 'No ICP segments in synthesis', request_id: requestId };
    }

    let aleadsToken: string | null = null;
    if (ALEADS_EMAIL && ALEADS_PASSWORD) {
      try {
        aleadsToken = await loginALeads(ALEADS_EMAIL, ALEADS_PASSWORD);
        console.log(`[${requestId}] A-Leads login OK`);
      } catch (err) {
        console.error(`[${requestId}] A-Leads login failed:`, (err as Error).message);
      }
    } else {
      console.warn(`[${requestId}] ALEADS_EMAIL/PASSWORD not configured — skipping Squirrel previews`);
    }

    const segmentResults: Array<{
      icp_key: string;
      name: string;
      geo: string;
      employee_range: string;
      industries: string[];
      industryProfileName: string;
      industryKeywords: string;
      estimatedCompanyCount: number;
      companyPreviewUrl: string;
      jobTitleProfileName: string;
      jobTitleKeywords: string;
      estimatedContactCount: number;
      contactPreviewUrl: string;
      feasible: boolean;
    }> = [];

    const keywordProfiles: Record<string, unknown> = {};

    for (const segment of icpSegments) {
      const icpKey = String(segment.key ?? segment.name ?? '');
      const segName = String(segment.name ?? icpKey);
      const geo = String(segment.geo ?? '');
      const employeeRange = String(segment.employee_range ?? '');
      const industries = (segment.industries as string[]) ?? [];

      console.log(`[${requestId}] Processing segment: ${segName}`);

      let industryProfile: KeywordProfile = { profile_name: segName, keywords: industries.join(', ') };
      try {
        industryProfile = await generateKeywordProfile('industry', segment, synthesis, requestId);
      } catch (err) {
        console.error(`[${requestId}] Industry profile LLM error for ${segName}:`, (err as Error).message);
      }

      let jobTitleProfile: KeywordProfile = { profile_name: 'Decision Makers', keywords: '' };
      try {
        jobTitleProfile = await generateKeywordProfile('job_title', segment, synthesis, requestId);
      } catch (err) {
        console.error(`[${requestId}] Job title profile LLM error for ${segName}:`, (err as Error).message);
      }

      const industryKeywordList = industryProfile.keywords.split(',').map(k => k.trim()).filter(Boolean);
      const jobTitleKeywordList = jobTitleProfile.keywords.split(',').map(k => k.trim()).filter(Boolean);
      const hqLocation = geoToHqLocation(geo);
      const companySizeCodes = employeeRangeToSizeCodes(employeeRange);

      let estimatedCompanyCount = 0;
      if (aleadsToken) {
        try {
          estimatedCompanyCount = await squirrelCompanyPreview(
            aleadsToken, industryKeywordList, hqLocation, companySizeCodes, requestId
          );
          console.log(`[${requestId}] Squirrel company count for ${segName}: ${estimatedCompanyCount}`);
        } catch (err) {
          console.error(`[${requestId}] Squirrel company preview failed:`, (err as Error).message);
        }
      }

      let estimatedContactCount = 0;
      if (aleadsToken) {
        try {
          estimatedContactCount = await squirrelContactPreview(
            aleadsToken, jobTitleKeywordList, hqLocation, companySizeCodes, industryKeywordList, requestId
          );
          console.log(`[${requestId}] Squirrel contact count for ${segName}: ${estimatedContactCount}`);
        } catch (err) {
          console.error(`[${requestId}] Squirrel contact preview failed:`, (err as Error).message);
        }
      }

      const companyPreviewUrl = buildALeadsPreviewUrl('company', {
        categories_and_keywords: industryKeywordList,
        hq_location: hqLocation,
        mapped_company_size: companySizeCodes,
      });
      const contactPreviewUrl = buildALeadsPreviewUrl('contact', {
        categories_and_keywords: industryKeywordList,
        hq_location: hqLocation,
        mapped_company_size: companySizeCodes,
        job_titles: jobTitleKeywordList,
      });

      const feasible = estimatedCompanyCount >= MIN_ADDRESSABLE_COMPANIES || estimatedCompanyCount === 0;

      segmentResults.push({
        icp_key: icpKey,
        name: segName,
        geo,
        employee_range: employeeRange,
        industries,
        industryProfileName: industryProfile.profile_name,
        industryKeywords: industryProfile.keywords,
        estimatedCompanyCount,
        companyPreviewUrl,
        jobTitleProfileName: jobTitleProfile.profile_name,
        jobTitleKeywords: jobTitleProfile.keywords,
        estimatedContactCount,
        contactPreviewUrl,
        feasible,
      });

      keywordProfiles[icpKey] = {
        industry_profile_name: industryProfile.profile_name,
        industry_keywords: industryProfile.keywords,
        job_title_profile_name: jobTitleProfile.profile_name,
        job_title_keywords: jobTitleProfile.keywords,
        estimated_company_count: estimatedCompanyCount,
        estimated_contact_count: estimatedContactCount,
        generated_at: now,
      };
    }

    const updatedSynthesis = { ...synthesis, keyword_profiles: keywordProfiles };
    const { error: synthesisUpdateError } = await supabase
      .from('gtm_strategies')
      .update({ synthesis: updatedSynthesis })
      .eq('id', strategyId);

    if (synthesisUpdateError) {
      console.error(`[${requestId}] Failed to save keyword_profiles:`, synthesisUpdateError.message);
    }

    const oauthConfigJson = process.env.GOOGLE_OAUTH_CONFIG;
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const googleFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    const googleConfigured = !!(oauthConfigJson || serviceAccountJson);

    let docUrl: string | null = null;

    if (googleConfigured) {
      const docTitle = `${clientCode} | Execution Review`;
      const blocks = buildExecutionReviewDocBlocks(clientCode, now, segmentResults);
      try {
        const accessToken = oauthConfigJson
          ? await getGoogleAccessToken(oauthConfigJson)
          : await getGoogleAccessTokenFromServiceAccount(serviceAccountJson!);
        docUrl = await createRichDoc(accessToken, docTitle, blocks, googleFolderId);
        console.log(`[${requestId}] Google Doc created: ${docUrl}`);
      } catch (err) {
        console.error(`[${requestId}] Google Doc creation failed:`, (err as Error).message);
      }
    } else {
      console.warn(`[${requestId}] Google auth not configured — skipping doc creation`);
    }

    const wm = (client.workflow_metrics as Record<string, unknown>) ?? {};
    const updatedWm = {
      ...wm,
      sourcing_review: {
        ...((wm.sourcing_review as Record<string, unknown>) ?? {}),
        status: 'pending',
        started_at: now,
        attempts: 1,
        decided_at: null,
        duration_seconds: null,
        last_feedback: null,
        segments: segmentResults.map(s => ({
          name: s.name,
          icp_key: s.icp_key,
          estimated_companies: s.estimatedCompanyCount,
          estimated_contacts: s.estimatedContactCount,
          feasible: s.feasible,
        })),
      },
    };

    const clientUpdatePayload: Record<string, unknown> = {
      stage: 'data_sourcing',
      workflow_metrics: updatedWm,
    };
    if (docUrl) clientUpdatePayload.gtm_execution_review_doc_url = docUrl;

    const { error: updateError } = await supabase
      .from('clients')
      .update(clientUpdatePayload)
      .eq('id', client_id);

    if (updateError) {
      console.error(`[${requestId}] Client update failed:`, updateError.message);
      return { success: false, error: updateError.message, request_id: requestId };
    }

    const slackBotToken = process.env.SLACK_BOT_TOKEN;
    const slackChannel = process.env.SLACK_TEST_CHANNEL;

    if (slackBotToken && slackChannel) {
      const segSummary = segmentResults
        .map(s => `• ${s.name}: ~${s.estimatedCompanyCount} companies, ~${s.estimatedContactCount} contacts`)
        .join('\n');
      fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${slackBotToken}` },
        body: JSON.stringify({
          channel: slackChannel,
          text: `Execution Review ready for ${clientCode}`,
          blocks: [{
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Execution Review — Sourcing Approval Required*\n\nClient: *${clientCode}*\n${docUrl ? `Doc: ${docUrl}\n` : ''}\n*Segment previews:*\n${segSummary}\n\nApprove via:\n\`\`\`POST /functions/v1/gtm-approve\n{ "client_id": "${client_id}", "action": "sourcing_approve" }\`\`\``,
            },
          }],
        }),
      }).catch(err => console.error(`[${requestId}] Slack notify failed:`, (err as Error).message));
    }

    console.log(`[${requestId}] Execution review doc generated for client ${client_id}: ${segmentResults.length} segments`);

    return {
      success: true,
      client_id,
      strategy_id: strategyId,
      segments_processed: segmentResults.length,
      doc_url: docUrl,
      request_id: requestId,
    };

  } catch (error) {
    const msg = (error as Error).message;
    console.error(`[${requestId}] Unhandled error:`, msg);
    return { success: false, error: msg, request_id: requestId };
  }
}
