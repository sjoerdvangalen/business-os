/**
 * GTM Doc Render — ported from Supabase edge function
 * Creates Google Docs from GTM strategy synthesis
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signingInput = `${header}.${payload}`;
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signingInput)
  );
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
  });
  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Google Docs create error: ${err}`);
  }
  const doc = await createRes.json() as { documentId: string };
  const docId = doc.documentId;
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
  });
  if (!batchRes.ok) {
    const err = await batchRes.text();
    throw new Error(`Google Docs batchUpdate error: ${err}`);
  }
  if (folderId) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${docId}?addParents=${folderId}&fields=id`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
  }
  return `https://docs.google.com/document/d/${docId}/edit`;
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

const DEMO_CLIENT = 'Acme Consulting BV';
const DEMO_DATE = new Date().toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });

function buildDemoTemplateA(): DocBlock[] {
  return [
    { style: 'HEADING_1', text: `GTM STRATEGIE — ${DEMO_CLIENT.toUpperCase()}` },
    { style: 'NORMAL_TEXT', text: `${DEMO_DATE} | VGG Acquisition` },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'HEADING_1', text: '1. MARKTOBSERVATIE' },
    { style: 'NORMAL_TEXT', text: 'Acme Consulting opereert in een markt waar mid-market IT-dienstverleners actief op zoek zijn naar capaciteitsuitbreiding, maar traditionele aanbestedingstrajecten te traag zijn voor hun groeivraag. Er is een duidelijke mismatch tussen vraag (snel, flexibel, bewezen) en het huidige aanbod (generiek, traag, onbekend). Dat is precies waar wij op inhaken.' },
    { style: 'HEADING_2', text: 'Waarom Nu?' },
    { style: 'NORMAL_TEXT', text: 'Q2 2026 is het moment: budgetten zijn net vrijgegeven, Q1-evaluaties zijn afgerond en beslissers zijn actief op zoek naar nieuwe partnerships voor de tweede helft van het jaar.' },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'HEADING_1', text: '2. DOELGROEPEN' },
    { style: 'HEADING_2', text: 'Segment 1 — IT-dienstverleners NL (Tier 1)' },
    { style: 'NORMAL_TEXT', text: 'Sector:    IT Services / Managed Services', bold: true },
    { style: 'NORMAL_TEXT', text: 'Grootte:   50-300 medewerkers' },
    { style: 'NORMAL_TEXT', text: 'Persona:   Managing Director, Head of Delivery' },
    { style: 'NORMAL_TEXT', text: 'Signalen:  Actief aan het werven, recente projectwins, groeivermeldingen' },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'HEADING_2', text: 'Segment 2 — Consultancybureaus BE/NL (Tier 2)' },
    { style: 'NORMAL_TEXT', text: 'Sector:    Management Consulting / Strategy', bold: true },
    { style: 'NORMAL_TEXT', text: 'Grootte:   20-150 medewerkers' },
    { style: 'NORMAL_TEXT', text: 'Persona:   Partner, Operations Director' },
    { style: 'NORMAL_TEXT', text: 'Signalen:  Nieuwe kantooropeningen, team-uitbreiding posts' },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'HEADING_1', text: '3. STARTPUNT & RATIONALE' },
    { style: 'NORMAL_TEXT', text: 'Prioriteit: Segment 1 — IT-dienstverleners NL', bold: true },
    { style: 'NORMAL_TEXT', text: 'Marktgrootte: ~340 bedrijven gevonden, ~680 contacten geïdentificeerd' },
    { style: 'NORMAL_TEXT', text: 'Rationale: Hoogste intentie-signalen, kortste besliscyclus, directe match met Acme\'s track record. Segment 2 volgt in fase 2 zodra messaging gevalideerd is.' },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'HEADING_1', text: '4. AANPAK' },
    { style: 'HEADING_2', text: 'Fase 1 — Infrastructuur (Week 1-2)' },
    { style: 'NORMAL_TEXT', text: 'Domeinen, e-mailinboxen en warmup opzetten. Technische deliverability (SPF/DKIM/DMARC) valideren. Doelstelling: 3 domeinen, 9 inboxen klaar.' },
    { style: 'HEADING_2', text: 'Fase 2 — Live Test (Week 3-5)' },
    { style: 'NORMAL_TEXT', text: '2 hooks × 2 CTA-varianten testen op 200 contacten. Weekly review van open rate, reply rate en kwaliteit van reacties. Winnende variant selecteren.' },
    { style: 'HEADING_2', text: 'Fase 3 — Schalen (Week 6+)' },
    { style: 'NORMAL_TEXT', text: 'Winnende variant uitrollen naar resterende 480 contacten. Segment 2 openen. Maandelijkse optimalisatiecyclus op basis van reply data.' },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'HEADING_1', text: '5. VERWACHTE RESULTATEN' },
    { style: 'NORMAL_TEXT', text: 'Open rate:     45-60%', bold: true },
    { style: 'NORMAL_TEXT', text: 'Reply rate:    4-8%' },
    { style: 'NORMAL_TEXT', text: 'Meetings/mnd:  8-15 (na schaling)' },
    { style: 'NORMAL_TEXT', text: 'Tijdlijn:      Eerste meetings verwacht week 4-5' },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'HEADING_1', text: 'VOLGENDE STAP' },
    { style: 'NORMAL_TEXT', text: 'Klopt dit beeld? Wij horen graag of er aanpassingen nodig zijn op de doelgroepen of aanpak. Na uw akkoord starten we direct met de data & campagne opbouw.' },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'NORMAL_TEXT', text: 'Sjoerd van Galen | VGG Acquisition | sjoerd@vggacquisition.nl' },
  ];
}

function buildDemoTemplateB(): DocBlock[] {
  return [
    { style: 'HEADING_1', text: `Outbound Strategie voor ${DEMO_CLIENT}` },
    { style: 'NORMAL_TEXT', text: `Opgesteld door VGG Acquisition · ${DEMO_DATE}` },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'HEADING_1', text: 'Wat Wij Zien' },
    { style: 'NORMAL_TEXT', text: 'De markt voor IT-consultancy in Nederland is competitief maar onoverzichtelijk voor inkopers. Bedrijven die op zoek zijn naar een betrouwbare partner zien een zee van aanbieders die allemaal hetzelfde beweren. Acme Consulting heeft een duidelijk onderscheidend profiel — de combinatie van sectorspecialisatie en implementatiesnelheid is zeldzaam — maar dat verhaal bereikt de juiste beslissers nu onvoldoende.' },
    { style: 'HEADING_2', text: 'De Kans' },
    { style: 'NORMAL_TEXT', text: 'Q2 is historisch het sterkste kwartaal voor nieuwe consultancyopdrachten. Budgetten zijn vrijgegeven, Q1-evaluaties zijn gedaan en directeuren staan open voor nieuwe samenwerkingen. Onze data laat zien dat er nu ~340 actief groeiende IT-dienstverleners in Nederland zijn die precies het profiel matchen van Acme\'s ideale klant. Dat is het window.' },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'HEADING_1', text: 'Uw Doelgroep' },
    { style: 'HEADING_2', text: 'IT-dienstverleners in Nederland (Startpunt)' },
    { style: 'NORMAL_TEXT', text: 'We richten ons op Managing Directors en Heads of Delivery bij IT-dienstverleners van 50-300 medewerkers. Dit zijn mensen die projectcapaciteit inkopen, weten wat kwaliteit kost en niet voor de laagste prijs gaan. Ze worden bereikt via directe outreach — niet via LinkedIn-advertenties of cold calls die ze al jaren negeren.' },
    { style: 'HEADING_2', text: 'Managementconsultants BE/NL (Fase 2)' },
    { style: 'NORMAL_TEXT', text: 'In de tweede fase voegen we Belgische en Nederlandse managementconsultancybureaus toe. Iets langere besliscyclus, maar hogere contractwaarde. We wachten tot de eerste fase gevalideerd is voor we dit segment openen.' },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'HEADING_1', text: 'Bewezen Aanpak' },
    { style: 'NORMAL_TEXT', text: 'Onze outbound methodiek is gevalideerd bij 14 actieve klanten in vergelijkbare markten. Recente resultaten:' },
    { style: 'NORMAL_TEXT', text: '• IT-dienstverlener (120 mw): 11 meetings in 6 weken, 3 deals in pipeline' },
    { style: 'NORMAL_TEXT', text: '• Managementconsultancy (60 mw): 8 meetings in 4 weken, 1 getekend contract' },
    { style: 'NORMAL_TEXT', text: '• SaaS-bedrijf (200 mw): 23 meetings in 10 weken, €180k nieuwe ARR' },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'HEADING_1', text: 'Wat Wij Aanbieden' },
    { style: 'NORMAL_TEXT', text: 'Wij nemen de volledige outbound infrastructuur uit handen: domeinen, inboxen, warmup, data, campagne en optimalisatie. Geen freelancers die stukjes doen — één team dat de hele pipeline beheert en op resultaat wordt afgerekend. Maandelijkse review met u over pipeline kwaliteit en messaging.' },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'HEADING_1', text: 'Hoe We Het Doen' },
    { style: 'NORMAL_TEXT', text: 'Week 1-2: Infrastructuur. Domeinen registreren, inboxen aanmaken, warmup starten. Technische validatie (SPF/DKIM/DMARC). Eerste datapull: 680 contacten gesegmenteerd en verrijkt.' },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'NORMAL_TEXT', text: 'Week 3-5: Live test. 2 hooks testen op 200 contacten. Reply-analyse na week 4. Winnende variant selecteren op basis van data, niet onderbuikgevoel.' },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'NORMAL_TEXT', text: 'Week 6+: Schalen. Winnende aanpak uitrollen. Segment 2 openen. Maandelijkse optimalisatiecyclus. U ontvangt wekelijks een update over pipeline en meetingsaantal.' },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'HEADING_1', text: 'Wat U Kunt Verwachten' },
    { style: 'NORMAL_TEXT', text: 'Eerste meetings in week 4-5. Na volledig opstarten (week 6-8): 8-15 gekwalificeerde meetings per maand met beslissers die exact in uw doelgroep zitten. Open rates van 45-60%, reply rates van 4-8% — ruim boven branchegemiddelde.' },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'HEADING_1', text: 'Volgende Stap' },
    { style: 'NORMAL_TEXT', text: 'Heeft u opmerkingen op de doelgroepen of aanpak? Stuur ons een reactie. Na uw goedkeuring starten we direct — infrastructuur is binnen 48 uur operationeel.' },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'NORMAL_TEXT', text: 'Sjoerd van Galen | sjoerd@vggacquisition.nl | +31 6 00 000 000' },
  ];
}

function buildDemoTemplateC(): DocBlock[] {
  return [
    { style: 'HEADING_1', text: `${DEMO_CLIENT.toUpperCase()} — OUTBOUND STRATEGIE` },
    { style: 'NORMAL_TEXT', text: `VGG Acquisition · ${DEMO_DATE}` },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'HEADING_1', text: 'BOTTOM LINE' },
    { style: 'NORMAL_TEXT', text: 'Wij targetten 340 IT-dienstverleners in Nederland en benaderen 680 beslissers met gepersonaliseerde outreach. Verwacht resultaat: 8-15 gekwalificeerde meetings per maand vanaf week 6, met de eerste resultaten zichtbaar in week 4.' },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'HEADING_1', text: 'WIE WE TARGETTEN' },
    { style: 'HEADING_2', text: 'Prioriteit 1 — IT-dienstverleners NL' },
    { style: 'NORMAL_TEXT', text: '340 bedrijven · 680 contacten · 50-300 mw', bold: true },
    { style: 'NORMAL_TEXT', text: 'Managing Directors & Heads of Delivery' },
    { style: 'NORMAL_TEXT', text: 'Signalen: groei, werving, projectwins' },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'HEADING_2', text: 'Prioriteit 2 — Consultancybureaus BE/NL (fase 2)' },
    { style: 'NORMAL_TEXT', text: '180 bedrijven · 360 contacten · 20-150 mw', bold: true },
    { style: 'NORMAL_TEXT', text: 'Partners & Operations Directors' },
    { style: 'NORMAL_TEXT', text: 'Start zodra P1 gevalideerd is' },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'HEADING_1', text: 'WAT WE DOEN' },
    { style: 'NORMAL_TEXT', text: '1.  Week 1-2   Infrastructuur opzetten (domeinen, inboxen, warmup)' },
    { style: 'NORMAL_TEXT', text: '2.  Week 3-5   Live test: 2 hooks × 2 CTA\'s op 200 contacten' },
    { style: 'NORMAL_TEXT', text: '3.  Week 6+    Winnende variant opschalen naar alle 680 contacten' },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'HEADING_1', text: 'WAT HET OPLEVERT' },
    { style: 'NORMAL_TEXT', text: 'Open rate      45-60%', bold: true },
    { style: 'NORMAL_TEXT', text: 'Reply rate     4-8%' },
    { style: 'NORMAL_TEXT', text: 'Meetings/mnd   8-15 (na week 6)' },
    { style: 'NORMAL_TEXT', text: 'Eerste results week 4-5' },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'HEADING_1', text: 'BESLISSING NODIG' },
    { style: 'NORMAL_TEXT', text: 'Klopt dit plaatje? Stuur een akkoord en we starten binnen 48 uur.' },
    { style: 'NORMAL_TEXT', text: 'Aanpassing nodig? Laat het weten — we passen de doelgroepen of aanpak aan.' },
    { style: 'NORMAL_TEXT', text: '' },
    { style: 'NORMAL_TEXT', text: 'Sjoerd van Galen · sjoerd@vggacquisition.nl' },
  ];
}

function buildInternalDoc(clientName: string, synthesis: Record<string, unknown>): string {
  const s = synthesis;
  const lines: string[] = [];
  lines.push(`GTM STRATEGY BLUEPRINT — INTERNAL REVIEW`);
  lines.push(`Client: ${clientName}`);
  lines.push(`Synthesized: ${s.synthesized_at || 'Unknown'}`);
  lines.push(`Schema version: ${s.version || 1}`);
  lines.push(``);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`1. EXECUTIVE SUMMARY`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(String(s.company_thesis || ''));
  lines.push(``);
  const research = (s.research_context as Record<string, unknown>) ?? {};
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`2. COMPANY & OFFER UNDERSTANDING`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`Company: ${research.company_overview || ''}`);
  lines.push(``);
  lines.push(`Competition: ${research.competitive_landscape || ''}`);
  lines.push(``);
  lines.push(`Market: ${research.market_signals || ''}`);
  lines.push(``);
  const solutions = (s.solutions as Array<Record<string, unknown>>) ?? [];
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`3. SOLUTIONS IN SCOPE`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  if (solutions.length > 0) {
    solutions.forEach(sol => {
      lines.push(`${sol.name} [${sol.key}]`);
      lines.push(`  ${sol.value_proposition}`);
      lines.push(`  ${sol.description}`);
      const proof = (sol.proof_points as string[]) ?? [];
      if (proof.length > 0) lines.push(`  Proof: ${proof.join(' | ')}`);
      lines.push(``);
    });
  } else {
    lines.push(`(not yet defined)`);
    lines.push(``);
  }
  const qf = (s.qualification_framework as Record<string, unknown>) ?? {};
  const fc = (qf.firmographic_constraints as Record<string, unknown>) ?? {};
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`4. QUALIFICATION FRAMEWORK`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`Employees:    ${fc.min_employees || '?'} – ${fc.max_employees || '?'}`);
  lines.push(`Geos:         ${(fc.geos as string[] ?? []).join(', ') || 'All'}`);
  lines.push(`Include:      ${(fc.industries_include as string[] ?? []).join(', ') || 'All'}`);
  lines.push(`Exclude:      ${(fc.industries_exclude as string[] ?? []).join(', ') || 'None'}`);
  lines.push(``);
  const hardReq = (qf.hard_requirements as string[]) ?? [];
  if (hardReq.length > 0) {
    lines.push(`Hard requirements:`);
    hardReq.forEach(r => lines.push(`  + ${r}`));
    lines.push(``);
  }
  const hardDQ = (qf.hard_disqualifiers as string[]) ?? [];
  if (hardDQ.length > 0) {
    lines.push(`Hard disqualifiers:`);
    hardDQ.forEach(d => lines.push(`  ✗ ${d}`));
    lines.push(``);
  }
  const softSig = (qf.soft_signals as string[]) ?? [];
  if (softSig.length > 0) {
    lines.push(`Soft signals:`);
    softSig.forEach(sig => lines.push(`  ~ ${sig}`));
    lines.push(``);
  }
  const icpSegments = (s.icp_segments as Array<Record<string, unknown>>) ?? [];
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`5. ICP SEGMENT MAP`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  icpSegments.forEach(seg => {
    lines.push(`${seg.name} (${seg.geo}, ${seg.employee_range})`);
    lines.push(`  Industries: ${(seg.industries as string[] ?? []).join(', ')}`);
    lines.push(`  Sourcing: ${seg.sourcing_logic}`);
    const signals = (seg.signal_hypotheses as string[]) ?? [];
    if (signals.length > 0) lines.push(`  Signals: ${signals.join(' | ')}`);
    lines.push(``);
  });
  const personaMap = (s.persona_map as Array<Record<string, unknown>>) ?? [];
  const personaVerbs = (s.persona_start_verbs as Record<string, string[]>) ?? {};
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`6. BUYER PERSONA MAP`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  if (personaMap.length > 0) {
    personaMap.forEach(p => {
      const verbs = personaVerbs[p.key as string] ?? [];
      lines.push(`${p.label} [${p.key}]`);
      lines.push(`  Focus: ${(p.focus_themes as string[] ?? []).join(', ')}`);
      lines.push(`  Owns: ${p.owns_metric}`);
      lines.push(`  Pain: ${p.primary_pain}`);
      if (verbs.length > 0) lines.push(`  Start verbs: ${verbs.join(' / ')}`);
      lines.push(``);
    });
  } else {
    const personas = (s.buyer_personas as Array<Record<string, unknown>>) ?? [];
    personas.forEach(p => {
      lines.push(`${p.title}`);
      const pains = (p.pain_points as string[]) ?? [];
      if (pains.length > 0) lines.push(`  Pains: ${pains.join(' | ')}`);
      lines.push(``);
    });
  }
  const verticalMap = (s.vertical_map as Array<Record<string, unknown>>) ?? [];
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`7. VERTICAL MAP`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  if (verticalMap.length > 0) {
    verticalMap.forEach(v => {
      lines.push(`${v.vertical_key}`);
      lines.push(`  Customer term: ${v.customer_term}`);
      lines.push(`  Expert term:   ${v.expert_term}`);
      lines.push(`  Vertical pain: ${v.vertical_pain}`);
      lines.push(``);
    });
  } else {
    lines.push(`(not available — v1 synthesis)`);
    lines.push(``);
  }
  const proofAssets = (s.proof_assets as Array<Record<string, string>>) ?? [];
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`8. PROOF & CREDIBILITY MAP`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  proofAssets.forEach((p, i) => {
    lines.push(`${i + 1}. [${p.type?.toUpperCase()}] ${p.description}`);
    if (p.use_for) lines.push(`   → Use for: ${p.use_for}`);
  });
  lines.push(``);
  const formula = (s.value_prop_formula as Record<string, unknown>) ?? {};
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`9. VALUE PROP FORMULA (${formula.style || 'ERIC'}-style)`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`B1: ${formula.bullet_1_pattern || ''}`);
  lines.push(`B2: ${formula.bullet_2_pattern || ''}`);
  lines.push(`B3: ${formula.bullet_3_pattern || ''}`);
  lines.push(``);
  if (formula.product_mechanism) lines.push(`Product mechanism: ${formula.product_mechanism}`);
  if (formula.product_ai_component) lines.push(`AI component:      ${formula.product_ai_component}`);
  lines.push(`Word count target: ${formula.word_count_target || 65}`);
  lines.push(``);
  const matrix = (s.campaign_matrix_seed as Array<Record<string, unknown>>) ?? [];
  const validCells = matrix.filter(c => c.valid !== false);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`10. CAMPAIGN MATRIX (${validCells.length} valid cells)`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`NOTE: No priority. All cells are equal until pilot data determines winners.`);
  lines.push(``);
  if (validCells.length > 0) {
    validCells.forEach(cell => {
      lines.push(`${cell.cell_code}`);
      lines.push(`  solution=${cell.solution_key} | icp=${cell.icp_key} | vertical=${cell.vertical_key} | persona=${cell.persona_key} | geo=${cell.geo}`);
      const triggers = (cell.trigger_event_classes as string[]) ?? [];
      if (triggers.length > 0) lines.push(`  triggers: ${triggers.join(', ')}`);
      const titles = (cell.target_job_title_families as string[]) ?? [];
      if (titles.length > 0) lines.push(`  target titles: ${titles.join(', ')}`);
      lines.push(``);
    });
  } else {
    lines.push(`(not yet defined — will be populated after synthesis)`);
    lines.push(``);
  }
  const messaging = (s.messaging_direction as Record<string, string>) ?? {};
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`11. MESSAGING DIRECTION`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`Core angle: ${messaging.core_angle || ''}`);
  lines.push(`Proof narrative: ${messaging.proof_narrative || ''}`);
  lines.push(`Tone: ${messaging.tone_instructions || ''}`);
  lines.push(``);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`12. SOURCING FEASIBILITY NOTES`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`Status: PENDING — sourcing runs not yet completed.`);
  lines.push(`Each cell will show estimated_addressable_accounts after sourcing.`);
  lines.push(`Cells with insufficient volume → status: sourcing_failed (no messaging generated).`);
  lines.push(``);
  const risks = (s.risks_and_assumptions as Array<Record<string, string>>) ?? [];
  const openQ = (s.open_questions as string[]) ?? [];
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`13. RISKS / ASSUMPTIONS / OPEN QUESTIONS [INTERNAL ONLY]`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  risks.forEach((r, i) => {
    lines.push(`${i + 1}. [${r.type?.toUpperCase()}] ${r.description}`);
    if (r.mitigation) lines.push(`   → ${r.mitigation}`);
  });
  if (openQ.length > 0) {
    lines.push(``);
    lines.push(`Open questions:`);
    openQ.forEach((q, i) => lines.push(`  ${i + 1}. ${q}`));
  }
  if (s.internal_notes) {
    lines.push(``);
    lines.push(`Internal notes: ${s.internal_notes}`);
  }
  lines.push(``);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`14. INTERNAL DECISION BOX (score ≥80 = APPROVE)`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`[ ] ICP & qualification framework specifiek genoeg?  (0-20 pts)  ___`);
  lines.push(`[ ] Persona × vertical matrix volledig en plausibel? (0-20 pts)  ___`);
  lines.push(`[ ] Value prop formula bruikbaar voor copy team?     (0-20 pts)  ___`);
  lines.push(`[ ] Proof assets overtuigend per vertical?           (0-20 pts)  ___`);
  lines.push(`[ ] Messaging richting scherp genoeg voor H1?        (0-20 pts)  ___`);
  lines.push(``);
  lines.push(`Score:    ___/100`);
  lines.push(`Feedback: ___`);
  lines.push(``);
  lines.push(`Approve: POST /functions/v1/gtm-approve { "client_id": "<id>", "action": "internal_approve", "score": <X>, "feedback": "..." }`);
  lines.push(`Reject:  POST /functions/v1/gtm-approve { "client_id": "<id>", "action": "internal_reject", "feedback": "..." }`);
  return lines.join('\n');
}

function buildExternalDoc(clientName: string, synthesis: Record<string, unknown>): string {
  const s = synthesis;
  const lines: string[] = [];
  lines.push(`GTM STRATEGIE — ${clientName.toUpperCase()}`);
  lines.push(``);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`WAT WE ZIEN`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(String(s.company_thesis || ''));
  lines.push(``);
  const focus = (s.recommended_initial_focus as Record<string, string>) ?? {};
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`AANBEVOLEN STARTPUNT`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`Oplossing: ${focus.solution || ''}`);
  lines.push(`Doelgroep: ${focus.icp || ''}`);
  lines.push(`Persona:   ${focus.persona || ''}`);
  lines.push(`Waarom:    ${focus.rationale || ''}`);
  lines.push(``);
  const icpSegments = (s.icp_segments as Array<Record<string, unknown>>) ?? [];
  if (icpSegments.length > 0) {
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`DOELGROEPEN`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    icpSegments.forEach(seg => {
      lines.push(`${seg.name} — ${seg.geo}, ${seg.employee_range} medewerkers`);
      lines.push(`  Sectoren: ${(seg.industries as string[] ?? []).join(', ')}`);
      lines.push(``);
    });
  }
  const proofAssets = (s.proof_assets as Array<Record<string, unknown>>) ?? [];
  if (proofAssets.length > 0) {
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`WAAROM HET WERKT`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    proofAssets.forEach(p => {
      lines.push(`${p.description}`);
    });
    lines.push(``);
  }
  const entryOffers = (s.entry_offers as Array<Record<string, unknown>>) ?? [];
  if (entryOffers.length > 0) {
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`AANPAK & AANBOD`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    entryOffers.forEach(offer => {
      lines.push(`${offer.name}: ${offer.description}`);
      if (offer.conversion_hook) lines.push(`Hook: ${offer.conversion_hook}`);
      lines.push(``);
    });
  }
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`VOLGENDE STAP`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`Heeft u opmerkingen of aanpassingen op de strategie? Laat het ons weten.`);
  lines.push(`Na uw goedkeuring starten we direct met de data & campagne opbouw.`);
  return lines.join('\n');
}

export interface DocRenderOptions {
  client_id?: string;
  mode?: 'internal' | 'external' | 'demo';
}

export interface DocRenderResult {
  success: boolean;
  client_id?: string;
  mode?: string;
  doc_url?: string | null;
  google_configured?: boolean;
  templates?: Record<string, { name: string; url: string }>;
  request_id: string;
  error?: string;
}

export async function runDocRender(opts: DocRenderOptions): Promise<DocRenderResult> {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  try {
    const { client_id, mode } = opts;

    // Demo mode
    if (mode === 'demo') {
      const oauthCfg = process.env.GOOGLE_OAUTH_CONFIG;
      const svcAcct = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      if (!oauthCfg && !svcAcct) {
        return { success: false, error: 'Google credentials not configured', request_id: requestId };
      }
      const token = oauthCfg
        ? await getGoogleAccessToken(oauthCfg)
        : await getGoogleAccessTokenFromServiceAccount(svcAcct!);
      const [urlA, urlB, urlC] = await Promise.all([
        createRichDoc(token, `[Demo A] Consulting Compact — ${DEMO_CLIENT}`, buildDemoTemplateA(), folderId),
        createRichDoc(token, `[Demo B] Agency Story — ${DEMO_CLIENT}`, buildDemoTemplateB(), folderId),
        createRichDoc(token, `[Demo C] Executive Brief — ${DEMO_CLIENT}`, buildDemoTemplateC(), folderId),
      ]);
      console.log(`[${requestId}] Demo docs created: A=${urlA} B=${urlB} C=${urlC}`);
      return {
        success: true,
        templates: {
          A: { name: 'Consulting Compact', url: urlA },
          B: { name: 'Agency Story', url: urlB },
          C: { name: 'Executive Brief', url: urlC },
        },
        request_id: requestId,
      };
    }

    if (!client_id || !mode) {
      return { success: false, error: 'Missing client_id or mode', request_id: requestId };
    }
    if (mode !== 'internal' && mode !== 'external') {
      return { success: false, error: 'mode must be internal or external', request_id: requestId };
    }

    const { data: client, error: fetchError } = await supabase
      .from('clients')
      .select('id, name, gtm_synthesis, workflow_metrics, approval_status')
      .eq('id', client_id)
      .single();

    if (fetchError || !client) {
      return { success: false, error: `Client not found: ${fetchError?.message}`, request_id: requestId };
    }

    const { data: strategyRow } = await supabase
      .from('gtm_strategies')
      .select('synthesis')
      .eq('client_id', client_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const synthesis = (strategyRow?.synthesis ?? client.gtm_synthesis) as Record<string, unknown> | null;
    if (!synthesis) {
      return { success: false, error: 'GTM synthesis not yet available', request_id: requestId };
    }

    const wm = (client.workflow_metrics as Record<string, unknown>) ?? {};
    const now = new Date().toISOString();

    const oauthConfigJson = process.env.GOOGLE_OAUTH_CONFIG;
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const googleFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    let docUrl: string | null = null;
    let docError: string | null = null;
    const googleConfigured = !!(oauthConfigJson || serviceAccountJson);

    if (googleConfigured) {
      const title = mode === 'internal'
        ? `GTM Strategy — ${client.name} [Internal]`
        : `GTM Strategy — ${client.name}`;
      const content = mode === 'internal'
        ? buildInternalDoc(String(client.name), synthesis)
        : buildExternalDoc(String(client.name), synthesis);

      try {
        let accessToken: string;
        if (oauthConfigJson) {
          console.log(`[${requestId}] Using OAuth configuration`);
          accessToken = await getGoogleAccessToken(oauthConfigJson);
        } else {
          console.log(`[${requestId}] Using Service Account configuration (legacy)`);
          accessToken = await getGoogleAccessTokenFromServiceAccount(serviceAccountJson!);
        }
        docUrl = await createGoogleDoc(accessToken, title, content, googleFolderId);
        console.log(`[${requestId}] Google Doc created: ${docUrl}`);
      } catch (err) {
        docError = (err as Error).message;
        console.error(`[${requestId}] Google Doc creation failed: ${docError}`);
      }
    } else {
      console.warn(`[${requestId}] GOOGLE_OAUTH_CONFIG or GOOGLE_SERVICE_ACCOUNT_JSON not configured — skipping doc creation`);
    }

    // Handle failure path
    if (googleConfigured && docError) {
      let failureWm: Record<string, unknown>;
      if (mode === 'internal') {
        failureWm = {
          ...wm,
          internal_approval: {
            ...((wm.internal_approval as Record<string, unknown>) ?? {}),
            last_feedback: `Doc render failed: ${docError}`,
          },
        };
      } else {
        failureWm = {
          ...wm,
          external_approval: {
            ...((wm.external_approval as Record<string, unknown>) ?? {}),
            last_feedback: `Doc render failed: ${docError}`,
          },
        };
        await supabase
          .from('clients')
          .update({ workflow_metrics: failureWm, approval_status: 'internal_approved' })
          .eq('id', client_id);
        return { success: false, error: `External doc render failed: ${docError}`, request_id: requestId };
      }
      await supabase
        .from('clients')
        .update({ workflow_metrics: failureWm })
        .eq('id', client_id);
      return { success: false, error: `Internal doc render failed: ${docError}`, request_id: requestId };
    }

    // Update DB based on mode
    let updatePayload: Record<string, unknown> = {};
    if (mode === 'internal') {
      const updatedWm = {
        ...wm,
        internal_approval: {
          ...((wm.internal_approval as Record<string, unknown>) ?? {}),
          status: 'pending',
          started_at: now,
        },
      };
      updatePayload = {
        approval_status: 'internal_review',
        stage: 'internal_approval',
        workflow_metrics: updatedWm,
        ...(docUrl ? { gtm_strategy_doc_url: docUrl } : {}),
      };
    } else {
      const externalApprovalBlock = (wm.external_approval as Record<string, unknown>) ?? {};
      const updatedWm = {
        ...wm,
        external_approval: {
          ...externalApprovalBlock,
          status: 'pending',
          started_at: now,
        },
      };
      updatePayload = {
        approval_status: 'external_sent',
        stage: 'external_approval',
        workflow_metrics: updatedWm,
        ...(docUrl ? { gtm_strategy_doc_external_url: docUrl } : {}),
      };
    }

    const { error: updateError } = await supabase
      .from('clients')
      .update(updatePayload)
      .eq('id', client_id);

    if (updateError) {
      console.error(`[${requestId}] DB update failed:`, updateError.message);
      return { success: false, error: updateError.message, request_id: requestId };
    }

    // Fire notifications
    const supabaseUrl = process.env.SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    fetch(`${supabaseUrl}/functions/v1/gtm-gate-notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
      body: JSON.stringify({ client_id, event: mode === 'internal' ? 'internal_review' : 'external_review' }),
    }).catch(err => console.error(`[${requestId}] gtm-gate-notify failed:`, (err as Error).message));

    console.log(`[${requestId}] Doc render complete: mode=${mode} client=${client_id} doc=${docUrl ?? 'skipped'}`);

    return {
      success: true,
      client_id,
      mode,
      doc_url: docUrl,
      google_configured: googleConfigured,
      request_id: requestId,
    };

  } catch (error) {
    const msg = (error as Error).message;
    console.error(`[${requestId}] Unhandled error:`, msg);
    return { success: false, error: msg, request_id: requestId };
  }
}
