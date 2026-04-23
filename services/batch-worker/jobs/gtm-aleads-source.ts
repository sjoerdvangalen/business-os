import { createClient } from '@supabase/supabase-js';

const ALEADS_EMAIL = process.env['ALEADS_EMAIL'] ?? '';
const ALEADS_PASSWORD = process.env['ALEADS_PASSWORD'] ?? '';
const MIN_ADDRESSABLE_COMPANIES = 10;
const BULK_POLL_MAX_ATTEMPTS = 30;
const BULK_POLL_INTERVAL_MS = 10000;

// ── A-Leads cookie auth ──────────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────────────────

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

// ── Bulk company search flow ─────────────────────────────────────────────────────

async function startBulkCompanySearch(
  token: string,
  jobName: string,
  industryKeywords: string[],
  hqLocation: string[],
  mappedCompanySize: string[],
  requestId: string
): Promise<string> {
  const payload = {
    exportType: 'company_search',
    name: jobName,
    categories_and_keywords: industryKeywords,
    hq_location: hqLocation,
    mapped_company_size: mappedCompanySize,
    __showIncludedCompanyKeywords: true,
    __company_keyword_include_name: true,
    __company_keyword_include_desc: true,
    __showExcludedCompanyKeywords: false,
    __showExcludedTechnologies: false,
  };

  const resp = await fetch('https://app.a-leads.co/api/tool/bulk/company-search', {
    method: 'POST',
    headers: aleadsHeaders(token),
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Bulk company-search error ${resp.status}: ${err}`);
  }

  const data = await resp.json() as { data?: { output_file_name?: string }; output_file_name?: string };
  const fileName = data.data?.output_file_name ?? data.output_file_name;
  if (!fileName) throw new Error('Bulk job started but no output_file_name returned');
  console.log(`[${requestId}] Bulk job started, output_file_name: ${fileName}`);
  return fileName;
}

async function pollBulkJobCompletion(
  token: string,
  outputFileName: string,
  requestId: string
): Promise<string> {
  for (let attempt = 0; attempt < BULK_POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise(r => setTimeout(r, BULK_POLL_INTERVAL_MS));

    const resp = await fetch('https://app.a-leads.co/api/tool/bulk/files?page=1&pageSize=20', {
      method: 'GET',
      headers: aleadsHeaders(token),
    });

    if (!resp.ok) {
      console.error(`[${requestId}] Bulk files poll error ${resp.status}`);
      continue;
    }

    const data = await resp.json() as {
      data?: Array<{ output_file_name?: string; status?: string; name?: string }>
    };
    const files = data.data ?? [];
    const job = files.find(f => f.output_file_name === outputFileName || f.name === outputFileName);

    if (!job) {
      console.log(`[${requestId}] Bulk job not found yet (attempt ${attempt + 1})`);
      continue;
    }

    if (job.status === 'completed') {
      console.log(`[${requestId}] Bulk job completed after ${attempt + 1} polls`);
      return outputFileName;
    }

    if (job.status === 'failed') {
      throw new Error(`Bulk job failed: ${outputFileName}`);
    }

    console.log(`[${requestId}] Bulk job status: ${job.status} (attempt ${attempt + 1})`);
  }

  throw new Error(`Bulk job polling timeout after ${BULK_POLL_MAX_ATTEMPTS} attempts`);
}

async function downloadBulkFile(
  token: string,
  outputFileName: string,
  requestId: string
): Promise<string> {
  const resp = await fetch('https://app.a-leads.co/api/tool/bulk/download-file', {
    method: 'POST',
    headers: aleadsHeaders(token),
    body: JSON.stringify({ fileName: outputFileName }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Bulk download-file error ${resp.status}: ${err}`);
  }

  const data = await resp.json() as { url?: string; download_url?: string; data?: { url?: string } };
  const signedUrl = data.url ?? data.download_url ?? data.data?.url;
  if (!signedUrl) throw new Error('No signed URL returned from download-file');
  console.log(`[${requestId}] Got signed URL for bulk download`);

  const csvResp = await fetch(signedUrl);
  if (!csvResp.ok) throw new Error(`CSV download error ${csvResp.status}`);
  return await csvResp.text();
}

// ── CSV parser ───────────────────────────────────────────────────────────────────

interface ParsedCompany {
  name: string;
  website: string;
  employee_count: number | null;
  address: string;
  city: string;
  country: string;
  linkedin_url: string;
  industries: string;
}

function parseCompanyCsv(csvText: string): ParsedCompany[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const results: ParsedCompany[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Simple CSV parse — handles quoted fields
    const cols: string[] = [];
    let inQuote = false;
    let current = '';
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { cols.push(current); current = ''; }
      else { current += ch; }
    }
    cols.push(current);

    const get = (key: string) => {
      const idx = header.findIndex(h => h.includes(key));
      return idx >= 0 ? (cols[idx] ?? '').trim() : '';
    };

    const name = get('company');
    if (!name) continue;

    const empStr = get('employees').replace(/[^0-9]/g, '');
    results.push({
      name,
      website: get('website'),
      employee_count: empStr ? parseInt(empStr) : null,
      address: get('address'),
      city: get('city'),
      country: get('country'),
      linkedin_url: get('linkedin'),
      industries: get('industries'),
    });
  }

  return results;
}

// ── Bulk person search flow (cookie-based, replaces broken v1 REST API) ──────────

async function startBulkPersonSearch(
  token: string,
  jobName: string,
  industryKeywords: string[],
  hqLocation: string[],
  mappedCompanySize: string[],
  requestId: string
): Promise<string> {
  const payload = {
    searchType: 'total',
    exportType: 'person_search',
    name: jobName,
    filters: {
      categories_and_keywords: industryKeywords,
      hq_location: hqLocation,
      mapped_company_size: mappedCompanySize,
      member_management_level: ['Manager', 'Director', 'Senior', 'Head', 'C-Level', 'Founder', 'Owner', 'Partner', 'President/Vice President'],
    },
    parsedFilters: {
      categories_and_keywords: industryKeywords,
      hq_location: hqLocation,
      mapped_company_size: mappedCompanySize.map((s: string) => parseInt(s)),
    },
    creditLimit: 100,
    phoneEnrich: false,
    emailEnrich: false,
    personalEmailEnrich: false,
    partialEnrich: false,
    crm: { enabled: false, selectedProfile: null },
    maxPeoplePerCompany: 3,
  };

  const resp = await fetch('https://app.a-leads.co/api/tool/bulk/advanced-search', {
    method: 'POST',
    headers: aleadsHeaders(token),
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Bulk person-search error ${resp.status}: ${err}`);
  }

  const data = await resp.json() as { data?: { output_file_name?: string }; output_file_name?: string };
  const fileName = data.data?.output_file_name ?? data.output_file_name;
  if (!fileName) throw new Error('Bulk person job started but no output_file_name returned');
  console.log(`[${requestId}] Bulk person job started, output_file_name: ${fileName}`);
  return fileName;
}

// ── Person CSV parser ────────────────────────────────────────────────────────────

interface ParsedPerson {
  first_name: string;
  last_name: string;
  email: string;
  linkedin_url: string;
  title: string;
  seniority: string;
  department: string;
  company_name: string;
  company_domain: string;
  confidence_score: number;
}

function parsePersonCsv(csvText: string): ParsedPerson[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const results: ParsedPerson[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const cols: string[] = [];
    let inQuote = false;
    let current = '';
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { cols.push(current); current = ''; }
      else { current += ch; }
    }
    cols.push(current);

    const get = (key: string) => {
      const idx = header.findIndex(h => h.includes(key));
      return idx >= 0 ? (cols[idx] ?? '').trim() : '';
    };

    const firstName = get('first name') || get('first_name');
    if (!firstName) continue;

    const domainRaw = get('company website') || get('website') || get('domain') || get('company domain');
    const domain = domainRaw.replace(/^https?:\/\/(www\.)?/, '').split('/')[0].toLowerCase();

    results.push({
      first_name: firstName,
      last_name: get('last name') || get('last_name'),
      email: get('email') || get('business email') || get('work email'),
      linkedin_url: get('linkedin') || get('person linkedin') || get('linkedin url'),
      title: get('job title') || get('title') || get('position'),
      seniority: get('seniority') || get('management level'),
      department: get('department') || get('job function'),
      company_name: get('company') || get('company name') || get('company_name'),
      company_domain: domain,
      confidence_score: parseFloat(get('confidence score') || get('confidence')) || 0,
    });
  }

  return results;
}

// ── Main handler ─────────────────────────────────────────────────────────────────

interface AleadsSourceOptions {
  client_id: string;
  cell_id?: string;
  sourcing_run_id?: string;
  dry_run?: boolean;
}

export async function runAleadsSource(opts: AleadsSourceOptions): Promise<Record<string, unknown>> {
  const { client_id, cell_id, sourcing_run_id: inputRunId, dry_run = false } = opts;

  const supabase = createClient(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!
  );

  const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  try {
    if (!client_id) {
      return { success: false, error: 'Missing client_id', request_id: requestId };
    }

    if (!ALEADS_EMAIL || !ALEADS_PASSWORD) {
      return { success: false, error: 'ALEADS_EMAIL/ALEADS_PASSWORD not configured', request_id: requestId };
    }

    // Load client
    const { data: client, error: fetchError } = await supabase
      .from('clients')
      .select('id, name, client_code, workflow_metrics')
      .eq('id', client_id)
      .single();

    if (fetchError || !client) {
      return { success: false, error: `Client not found: ${fetchError?.message}`, request_id: requestId };
    }

    const clientCode = String((client as Record<string, unknown>).client_code ?? client.name ?? 'CLIENT');

    // Load synthesis from gtm_strategies
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
    const icpSegments = (synthesis.icp_segments as Array<Record<string, unknown>>) ?? [];
    const keywordProfiles = (synthesis.keyword_profiles as Record<string, Record<string, unknown>>) ?? {};
    const wm = (client.workflow_metrics as Record<string, unknown>) ?? {};
    const now = new Date().toISOString();

    if (icpSegments.length === 0) {
      return { success: false, error: 'No ICP segments in synthesis', request_id: requestId };
    }

    // If cell_id provided, narrow to that cell's ICP segment
    let targetSegments = icpSegments;
    if (cell_id) {
      const { data: cellRow } = await supabase
        .from('campaign_cells')
        .select('icp_key')
        .eq('id', cell_id)
        .single();
      if (cellRow?.icp_key) {
        targetSegments = icpSegments.filter(s =>
          (s.key === cellRow.icp_key) || (s.name === cellRow.icp_key)
        );
        if (targetSegments.length === 0) {
          return { success: false, error: `ICP segment ${cellRow.icp_key} not found in synthesis`, request_id: requestId };
        }
      }
    }

    // Login to A-Leads
    const aleadsToken = await loginALeads(ALEADS_EMAIL, ALEADS_PASSWORD);
    console.log(`[${requestId}] A-Leads login OK`);

    const sourcing_run_id = inputRunId || `run_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    console.log(`[${requestId}] Starting sourcing run ${sourcing_run_id} for client ${client_id}${cell_id ? ` cell ${cell_id}` : ''}`);

    let totalCompanies = 0;
    let totalContactsCreated = 0;
    let totalLeadsCreated = 0;
    const segmentStats: Array<{ name: string; companies: number; contacts: number }> = [];
    const upsertedCompanyIds: string[] = [];

    for (const segment of targetSegments) {
      const icpKey = String(segment.key ?? segment.name ?? '');
      const segName = String(segment.name ?? icpKey);
      const geo = String(segment.geo ?? '');
      const employeeRange = String(segment.employee_range ?? '');
      const industries = (segment.industries as string[]) ?? [];

      console.log(`[${requestId}] Sourcing segment: ${segName}`);

      // Read keyword_profiles from synthesis (populated by gtm-execution-review-doc)
      const profile = keywordProfiles[icpKey];
      const industryKeywordList = profile?.industry_keywords
        ? (profile.industry_keywords as string).split(',').map(k => k.trim()).filter(Boolean)
        : industries;

      const hqLocation = geoToHqLocation(geo);
      const companySizeCodes = employeeRangeToSizeCodes(employeeRange);

      // Use first 10 keywords for bulk job
      const bulkKeywords = industryKeywordList.slice(0, 10);
      const jobName = `${clientCode}-${icpKey}-${Date.now()}`;

      let companies: ParsedCompany[] = [];
      let bulkError = false;

      try {
        const outputFileName = await startBulkCompanySearch(
          aleadsToken, jobName, bulkKeywords, hqLocation, companySizeCodes, requestId
        );
        await pollBulkJobCompletion(aleadsToken, outputFileName, requestId);
        const csvText = await downloadBulkFile(aleadsToken, outputFileName, requestId);
        companies = parseCompanyCsv(csvText);
        console.log(`[${requestId}] Segment ${segName}: ${companies.length} companies from bulk CSV`);
      } catch (err) {
        console.error(`[${requestId}] Bulk sourcing failed for ${segName}:`, (err as Error).message);
        bulkError = true;
      }

      // Upsert companies into Supabase
      let segCompanies = 0;
      const segmentCompanyIds: string[] = [];
      for (const company of companies) {
        const domain = company.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0].toLowerCase();

        const { data: existing } = await supabase
          .from('companies')
          .select('id')
          .eq('domain', domain || 'NODOMAIN')
          .maybeSingle();

        if (existing) {
          segmentCompanyIds.push(existing.id);
          segCompanies++;
          continue;
        }

        let upsertResult: { data: { id: string }[] | null; error: any } = { data: null, error: null };

        if (!domain) {
          // Insert without domain conflict check
          upsertResult = await supabase
            .from('companies')
            .insert({
              name: company.name,
              website: company.website || null,
              domain: null,
              employee_count: company.employee_count,
              city: company.city || null,
              country: company.country || null,
              linkedin_url: company.linkedin_url || null,
              industry: company.industries || null,
              source: 'aleads_bulk',
              enrichment_data: { sourcing_run_id, icp_segment: segName },
              first_seen_at: now,
            })
            .select('id');
        } else {
          upsertResult = await supabase
            .from('companies')
            .upsert({
              name: company.name,
              website: company.website || null,
              domain,
              employee_count: company.employee_count,
              city: company.city || null,
              country: company.country || null,
              linkedin_url: company.linkedin_url || null,
              industry: company.industries || null,
              source: 'aleads_bulk',
              enrichment_data: { sourcing_run_id, icp_segment: segName },
              first_seen_at: now,
            }, { onConflict: 'domain', ignoreDuplicates: false })
            .select('id');
        }

        if (!upsertResult.error && upsertResult.data && upsertResult.data.length > 0) {
          segCompanies++;
          segmentCompanyIds.push(upsertResult.data[0].id);
        }
      }

      totalCompanies += segCompanies;
      upsertedCompanyIds.push(...segmentCompanyIds);

      // ── Bulk contact finding for this segment's companies ──
      let segContacts = 0;
      if (!dry_run && segmentCompanyIds.length > 0) {
        const { data: companyRows } = await supabase
          .from('companies')
          .select('id, name, domain')
          .in('id', segmentCompanyIds);

        const domainToCompanyId = new Map<string, string>();
        const nameToCompanyId = new Map<string, string>();
        for (const c of (companyRows ?? [])) {
          if (c.domain) domainToCompanyId.set(c.domain.toLowerCase(), c.id);
          if (c.name) nameToCompanyId.set(c.name.toLowerCase(), c.id);
        }

        try {
          const personJobName = `${clientCode}-${icpKey}-people-${Date.now()}`;
          const personOutputFileName = await startBulkPersonSearch(
            aleadsToken, personJobName, bulkKeywords, hqLocation, companySizeCodes, requestId
          );
          await pollBulkJobCompletion(aleadsToken, personOutputFileName, requestId);
          const personCsvText = await downloadBulkFile(aleadsToken, personOutputFileName, requestId);
          const persons = parsePersonCsv(personCsvText);
          console.log(`[${requestId}] Segment ${segName}: ${persons.length} persons from bulk CSV`);

          for (const person of persons) {
            // Match person to company by domain or name
            let companyId = domainToCompanyId.get(person.company_domain);
            if (!companyId && person.company_name) {
              companyId = nameToCompanyId.get(person.company_name.toLowerCase());
            }
            if (!companyId) {
              console.log(`[${requestId}] Could not match person to company: ${person.first_name} ${person.last_name} @ ${person.company_name}`);
              continue;
            }

            // Deduplicate by email or linkedin
            const { data: existingByLinkedIn } = person.linkedin_url
              ? await supabase.from('contacts').select('id').eq('linkedin_url', person.linkedin_url).maybeSingle()
              : { data: null };
            const { data: existingByEmail } = person.email
              ? await supabase.from('contacts').select('id').eq('email', person.email).maybeSingle()
              : { data: null };

            const existing = existingByLinkedIn || existingByEmail;

            if (existing) {
              segContacts++;
              if (cell_id) {
                await supabase.from('leads').upsert({
                  contact_id: existing.id,
                  client_id,
                  cell_id,
                  status: 'sourced',
                  added_at: now,
                  updated_at: now,
                }, { onConflict: 'contact_id,cell_id' });
              }
              continue;
            }

            const { data: newContact, error: contactErr } = await supabase
              .from('contacts')
              .insert({
                company_id: companyId,
                client_id,
                first_name: person.first_name,
                last_name: person.last_name,
                email: person.email || null,
                email_verified: false,
                linkedin_url: person.linkedin_url || null,
                title: person.title || null,
                department: person.department || null,
                source: 'a-leads',
                source_id: companyId,
                email_waterfall_status: person.email ? 'existing' : 'pending',
                enrichment_data: {
                  confidence_score: person.confidence_score,
                  seniority: person.seniority,
                  department: person.department,
                  source: 'a-leads',
                  found_at: now,
                },
              })
              .select('id')
              .single();

            if (!contactErr && newContact) {
              segContacts++;
              totalContactsCreated++;
              if (cell_id) {
                const { error: leadErr } = await supabase.from('leads').insert({
                  contact_id: newContact.id,
                  client_id,
                  cell_id,
                  status: 'sourced',
                  added_at: now,
                  updated_at: now,
                });
                if (!leadErr) totalLeadsCreated++;
              }
            }
          }
        } catch (err) {
          console.error(`[${requestId}] Bulk person search failed for ${segName}:`, (err as Error).message);
        }
      }

      // Update campaign_cells feasibility for this segment
      const isFeasible = !bulkError && segCompanies >= MIN_ADDRESSABLE_COMPANIES;

      if (cell_id) {
        // Cell-scoped update: only update the requested cell
        const { data: cellRow } = await supabase
          .from('campaign_cells')
          .select('id, brief')
          .eq('id', cell_id)
          .single();
        if (cellRow) {
          const existingBrief = (cellRow.brief as Record<string, unknown>) ?? {};
          await supabase
            .from('campaign_cells')
            .update({
              brief: {
                ...existingBrief,
                estimated_addressable_accounts: segCompanies,
                sourcing_findings_summary: `${segCompanies} companies, ${segContacts} contacts sourced via A-Leads for segment: ${segName}.`,
                feasibility_notes: isFeasible
                  ? null
                  : `Below minimum threshold (${segCompanies} companies, min ${MIN_ADDRESSABLE_COMPANIES}).`,
              },
              status: isFeasible ? 'sourcing_pending' : 'sourcing_failed',
            })
            .eq('id', cell_id);
        }
      } else {
        // Client-wide update: all cells for this ICP segment
        const { data: segCells } = await supabase
          .from('campaign_cells')
          .select('id, brief')
          .eq('client_id', client_id)
          .eq('icp_key', icpKey)
          .eq('status', 'sourcing_pending');

        for (const cell of (segCells ?? [])) {
          const existingBrief = (cell.brief as Record<string, unknown>) ?? {};
          await supabase
            .from('campaign_cells')
            .update({
              brief: {
                ...existingBrief,
                estimated_addressable_accounts: segCompanies,
                sourcing_findings_summary: `${segCompanies} companies sourced via A-Leads bulk for segment: ${segName}.`,
                feasibility_notes: isFeasible
                  ? null
                  : `Below minimum threshold (${segCompanies} companies, min ${MIN_ADDRESSABLE_COMPANIES}).`,
              },
              status: isFeasible ? 'sourcing_pending' : 'sourcing_failed',
            })
            .eq('id', cell.id);
        }
      }

      console.log(`[${requestId}] Segment ${segName}: ${segCompanies} companies, ${segContacts} contacts, feasible=${isFeasible}`);
      segmentStats.push({ name: segName, companies: segCompanies, contacts: segContacts });
    }

    // Update workflow_metrics
    const updatedWm = {
      ...wm,
      sourcing_review: {
        ...((wm.sourcing_review as Record<string, unknown>) ?? {}),
        total_companies: totalCompanies,
        sourcing_run_id,
        sourcing_completed_at: now,
        segments: segmentStats,
      },
    };

    await supabase
      .from('clients')
      .update({ workflow_metrics: updatedWm })
      .eq('id', client_id);

    // Slack notification
    const slackBotToken = process.env['SLACK_BOT_TOKEN'];
    const slackChannel = process.env['SLACK_TEST_CHANNEL'];

    if (slackBotToken && slackChannel) {
      fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${slackBotToken}` },
        body: JSON.stringify({
          channel: slackChannel,
          text: `A-Leads bulk sourcing complete for ${clientCode}`,
          blocks: [{
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*A-Leads Bulk Sourcing Complete*\n\nClient: *${clientCode}*${cell_id ? `\nCell: \`${cell_id}\`` : ''}\nRun: \`${sourcing_run_id}\`\n\n${segmentStats.map(s => `• ${s.name}: ${s.companies} companies, ${s.contacts} contacts`).join('\n')}\n\nTotal: ${totalCompanies} companies, ${totalContactsCreated} contacts, ${totalLeadsCreated} leads`,
            },
          }],
        }),
      }).catch(err => console.error(`[${requestId}] Slack notify failed:`, (err as Error).message));
    }

    console.log(`[${requestId}] Sourcing complete: ${totalCompanies} companies, ${totalContactsCreated} contacts, ${totalLeadsCreated} leads (run: ${sourcing_run_id})`);

    return {
      success: true,
      client_id,
      cell_id: cell_id || null,
      sourcing_run_id,
      companies_sourced: totalCompanies,
      contacts_created: totalContactsCreated,
      leads_created: totalLeadsCreated,
      company_ids: upsertedCompanyIds,
      request_id: requestId,
    };

  } catch (error) {
    const msg = (error as Error).message;
    console.error(`[${requestId}] Unhandled error:`, msg);
    return { success: false, error: msg, request_id: requestId };
  }
}
