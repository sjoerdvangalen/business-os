#!/usr/bin/env python3
"""
Build Template B v2 — GTM Campaign Plan
Structure: 4 sections (tabs) within one Google Doc
- Tab 1: Campaign Overview
- Tab 2: Validation Engine
- Tab 3: Messaging Engine
- Tab 4: Execution & Status
"""
from googleapiclient.discovery import build
from lib.google_auth import get_credentials


def get_services():
    creds = get_credentials()
    docs = build('docs', 'v1', credentials=creds)
    drive = build('drive', 'v3', credentials=creds)
    return docs, drive


def build_requests(content_blocks):
    """
    Build a single batchUpdate request list by appending text sequentially.
    Each block is a tuple: (text, style)
    Styles: 'HEADING_1', 'HEADING_2', 'HEADING_3', 'NORMAL_TEXT'
    """
    requests = []
    full_text = ""
    style_ranges = []

    pos = 1
    for text, style in content_blocks:
        start = pos
        full_text += text
        end = pos + len(text)
        style_ranges.append((start, end, style))
        pos = end

    requests.append({
        'insertText': {
            'location': {'index': 1},
            'text': full_text
        }
    })

    for start, end, style in style_ranges:
        if style != 'NORMAL_TEXT':
            requests.append({
                'updateParagraphStyle': {
                    'range': {'startIndex': start, 'endIndex': end},
                    'paragraphStyle': {'namedStyleType': style},
                    'fields': 'namedStyleType'
                }
            })

    return requests


def create_template_b(client_code='SECX', client_name='SentioCX', campaign_name='SECX-SAAS-NLBE-MAR'):
    docs_service, drive_service = get_services()

    title = f"Campaign Plan — {campaign_name}"
    doc = docs_service.documents().create(body={'title': title}).execute()
    doc_id = doc['documentId']

    blocks = []

    # Header
    blocks.append((f"Campaign Plan — {campaign_name}\n", 'HEADING_1'))
    blocks.append(("────────────────────────────────────────────────────────\n\n", 'NORMAL_TEXT'))

    # TAB 1 — CAMPAIGN OVERVIEW
    blocks.append(("Tab 1 — Campaign overview\n", 'HEADING_1'))
    blocks.append(("════════════════════════════════════════════════════════\n\n", 'NORMAL_TEXT'))

    blocks.append(("1. Context\n", 'HEADING_2'))
    blocks.append(("────────────────────────────────────────\n\n", 'NORMAL_TEXT'))
    blocks.append((
        f"Client:       {client_name} ({client_code})\n"
        f"Product:      [Omschrijf het product in één zin.]\n"
        f"Goal:         [Bijv. 50+ qualified meetings in 6 weken.]\n"
        f"Geography:    [Bijv. Nederland, België.]\n"
        f"Status:       Beta\n\n",
        'NORMAL_TEXT'
    ))

    blocks.append(("2. ICP definition\n", 'HEADING_2'))
    blocks.append(("────────────────────────────────────────\n\n", 'NORMAL_TEXT'))

    blocks.append(("ICP profile 1 — [Segmentnaam]\n", 'HEADING_3'))
    blocks.append((
        "Description:   [Korte beschrijving van dit segment.]\n\n"
        "Firmographics\n"
        "  Headcount:   [Bijv. 50–500.]\n"
        "  Revenue:     [Bijv. $5M–$100M ARR.]\n"
        "  Geography:   [Bijv. NL, BE.]\n\n"
        "Include keywords (company level)\n"
        "  [Komma-gescheiden lijst. Bijv. SaaS, software platform, B2B SaaS, cloud software.]\n\n"
        "Exclude keywords\n"
        "  [Bijv. agency, consultancy, nonprofit, government, retail.]\n\n"
        "Buying triggers\n"
        "  • [Bijv. Hiring customer support / CX roles.]\n"
        "  • [Bijv. Implementing Salesforce / Service Cloud.]\n"
        "  • [Bijv. Launching AI / automation initiatives.]\n\n"
        "Disqualifiers\n"
        "  • [Bijv. No support function.]\n"
        "  • [Bijv. Pure B2C low-touch product.]\n\n"
        "Technographic profile\n"
        "  [Bijv. Salesforce, Zendesk, HubSpot Service, Intercom.]\n\n",
        'NORMAL_TEXT'
    ))

    blocks.append(("ICP profile 2 — [Segmentnaam]\n", 'HEADING_3'))
    blocks.append(("  [Herhaal bovenstaande structuur.]\n\n", 'NORMAL_TEXT'))

    blocks.append(("3. Persona profiles\n", 'HEADING_2'))
    blocks.append(("────────────────────────────────────────\n\n", 'NORMAL_TEXT'))

    blocks.append(("Persona 1 — [Naam / rol]\n", 'HEADING_3'))
    blocks.append((
        "Keywords (komma-gescheiden)\n"
        "  [Bijv. VP customer experience, Head of customer experience, Director customer experience,\n"
        "  Chief customer officer, VP customer service, hoofd klantenservice, directeur klantenservice.]\n\n"
        "Pain (diepste laag)\n"
        "  [Wat kost dit hen nu in tijd, geld, reputatie of carrière.]\n\n"
        "Personal win\n"
        "  [Wat is de persoonlijke carrière-winst als dit opgelost is.]\n\n",
        'NORMAL_TEXT'
    ))

    blocks.append(("Persona 2 — [Naam / rol]\n", 'HEADING_3'))
    blocks.append(("  [Herhaal bovenstaande structuur.]\n\n", 'NORMAL_TEXT'))

    blocks.append(("Persona 3 — [Naam / rol]\n", 'HEADING_3'))
    blocks.append(("  [Herhaal bovenstaande structuur.]\n\n", 'NORMAL_TEXT'))

    blocks.append(("4. Offer\n", 'HEADING_2'))
    blocks.append(("────────────────────────────────────────\n\n", 'NORMAL_TEXT'))
    blocks.append((
        "Offer naam:     [Bijv. Escalation Audit.]\n"
        "Type:           [Resultaat / Pilot / Audit / Benchmark.]\n"
        "Persona:        [Primaire persona.]\n"
        "Probleem:       [Wat lost het op.]\n"
        "Output:         [Bijv. rapport, score, shortlist.]\n"
        "Tijdlijn:       [Bijv. 2 weken.]\n"
        "CTA:            [Bijv. 'Wil ik de audit sturen?'.]\n"
        "Risk reversal:  [Bijv. geen commitment nodig.]\n\n",
        'NORMAL_TEXT'
    ))

    blocks.append(("5. Value propositions\n", 'HEADING_2'))
    blocks.append(("────────────────────────────────────────\n\n", 'NORMAL_TEXT'))

    blocks.append(("Persona 1 — [Naam]\n", 'HEADING_3'))
    blocks.append((
        "Core prop:       [Maximaal 15 woorden.]\n"
        "Proof punt:      [Metric of case.]\n"
        "Differentiator:  [Wat wij doen dat alternatieven niet doen.]\n\n",
        'NORMAL_TEXT'
    ))

    blocks.append(("Persona 2 — [Naam]\n", 'HEADING_3'))
    blocks.append(("  [Herhaal bovenstaande structuur.]\n\n", 'NORMAL_TEXT'))

    blocks.append(("Persona 3 — [Naam]\n", 'HEADING_3'))
    blocks.append(("  [Herhaal bovenstaande structuur.]\n\n", 'NORMAL_TEXT'))

    # TAB 2 — VALIDATION ENGINE
    blocks.append(("Tab 2 — Validation engine\n", 'HEADING_1'))
    blocks.append(("════════════════════════════════════════════════════════\n\n", 'NORMAL_TEXT'))

    blocks.append(("1. A-leads configuration\n", 'HEADING_2'))
    blocks.append(("────────────────────────────────────────\n\n", 'NORMAL_TEXT'))
    blocks.append((
        "Company search URL\n"
        "  [Plak hier de volledige A-leads URL voor reproduceerbaarheid.]\n\n"
        "Filters\n"
        "  Geography:        [Bijv. NL, BE.]\n"
        "  Headcount:        [Bijv. 50–500.]\n"
        "  Industry:         [Bijv. Software, Internet.]\n"
        "  Technology:       [Bijv. Salesforce.]\n\n"
        "Include keywords\n"
        "  [Bijv. SaaS, software platform, B2B SaaS, cloud software, enterprise software.]\n\n"
        "Exclude keywords\n"
        "  [Bijv. agency, consultancy, nonprofit, government, retail.]\n\n"
        "Expected volume\n"
        "  [Bijv. 1.000–1.200 bedrijven.]\n\n",
        'NORMAL_TEXT'
    ))

    blocks.append(("2. Company scoring prompt\n", 'HEADING_2'))
    blocks.append(("────────────────────────────────────────\n\n", 'NORMAL_TEXT'))
    blocks.append((
        "Model: [Bijv. gpt-4o-mini.]\n\n"
        "Prompt:\n"
        "  Analyze this company for [CLIENT_NAME] targeting.\n\n"
        "  Company: {name}\n"
        "  Domain: {domain}\n"
        "  Industry: {industry}\n"
        "  Headcount: {headcount}\n"
        "  Summary: {summary}\n\n"
        "  Score 0–100 based on:\n"
        "  1. [Criterium 1 — bijv. Is dit een B2B SaaS of software bedrijf.]\n"
        "  2. [Criterium 2 — bijv. Is er een customer support functie aanwezig.]\n"
        "  3. [Criterium 3 — bijv. Is Salesforce aanwezig of waarschijnlijk.]\n"
        "  4. [Criterium 4 — bijv. Groeisignalen zichtbaar.]\n\n"
        "  Output JSON: { \"score\": number, \"approved\": boolean, \"reason\": string }\n\n"
        "Drempelwaarde: [Bijv. score >= 65 = approved.]\n\n",
        'NORMAL_TEXT'
    ))

    blocks.append(("3. Contact classification prompt\n", 'HEADING_2'))
    blocks.append(("────────────────────────────────────────\n\n", 'NORMAL_TEXT'))
    blocks.append((
        "Model: [Bijv. gpt-4o-mini.]\n\n"
        "Prompt:\n"
        "  Classify this contact for [CLIENT_NAME].\n\n"
        "  Name: {first_name} {last_name}\n"
        "  Title: {title}\n"
        "  Company: {company}\n\n"
        "  Classify as: champion, influencer, economic_buyer, blocker, irrelevant.\n\n"
        "  Output JSON: { \"type\": string, \"confidence\": number, \"reason\": string }\n\n",
        'NORMAL_TEXT'
    ))

    blocks.append(("4. Waterfall enrichment\n", 'HEADING_2'))
    blocks.append(("────────────────────────────────────────\n\n", 'NORMAL_TEXT'))
    blocks.append((
        "Volgorde:\n"
        "  Stap 1 — Pattern generation (gratis als niets gevonden via Enrow).\n"
        "           Patterns: first@, first.last@, f.last@, flast@, firstlast@\n\n"
        "  Stap 2 — TryKitt verify (bulk, alle patterns).\n"
        "           Als één valid is: stop hier.\n\n"
        "  Stap 3 — Enrow find email (als TryKitt faalt).\n"
        "           POST /email/find/single — naam + domein.\n\n"
        "  Stap 4 — Enrow verify (valideer Enrow resultaat).\n"
        "           Output: valid / invalid / catch_all / unknown.\n\n",
        'NORMAL_TEXT'
    ))

    # TAB 3 — MESSAGING ENGINE
    blocks.append(("Tab 3 — Messaging engine\n", 'HEADING_1'))
    blocks.append(("════════════════════════════════════════════════════════\n\n", 'NORMAL_TEXT'))

    blocks.append(("1. Kern boodschap\n", 'HEADING_2'))
    blocks.append(("────────────────────────────────────────\n\n", 'NORMAL_TEXT'))
    blocks.append((
        "[Interne formulering. Wat geloven wij over het probleem en de oplossing.]\n\n",
        'NORMAL_TEXT'
    ))

    blocks.append(("2. Angles per persona\n", 'HEADING_2'))
    blocks.append(("────────────────────────────────────────\n\n", 'NORMAL_TEXT'))

    blocks.append(("Persona 1 — [Naam]\n", 'HEADING_3'))
    blocks.append((
        "Primary message\n"
        "  [Één zin. Begin bij de prospect, nooit bij ons product.]\n\n"
        "Angle 1 — [Type: Pain observation / Peer comparison / Insight reveal / Offer-first / Status signal]\n"
        "  [Beschrijving van de angle.]\n\n"
        "Angle 2 — [Type]\n"
        "  [Beschrijving.]\n\n"
        "Angle 3 — [Type]\n"
        "  [Beschrijving.]\n\n",
        'NORMAL_TEXT'
    ))

    blocks.append(("Persona 2 — [Naam]\n", 'HEADING_3'))
    blocks.append(("  [Herhaal bovenstaande structuur.]\n\n", 'NORMAL_TEXT'))

    blocks.append(("Persona 3 — [Naam]\n", 'HEADING_3'))
    blocks.append(("  [Herhaal bovenstaande structuur.]\n\n", 'NORMAL_TEXT'))

    blocks.append(("3. Sequence structuur\n", 'HEADING_2'))
    blocks.append(("────────────────────────────────────────\n\n", 'NORMAL_TEXT'))
    blocks.append((
        "Stap 1 (dag 1)   — Observatie + vraag. Max 50 woorden.\n"
        "Stap 2 (dag 3–4) — Andere angle. Korter. Vervolg in thread.\n"
        "Stap 3 (dag 8–9) — Nieuw bericht, nieuw onderwerp.\n"
        "Stap 4 (dag 12)  — Breakup. Neutraal. Laat deur open.\n\n",
        'NORMAL_TEXT'
    ))

    blocks.append(("4. Copy (per persona per angle)\n", 'HEADING_2'))
    blocks.append(("────────────────────────────────────────\n\n", 'NORMAL_TEXT'))
    blocks.append((
        "Subjectline: [1–3 woorden, lowercase, geen punt.]\n\n"
        "Email body:\n"
        "  [Naam],\n\n"
        "  [Openingsregel — observatie over hun situatie, niet over ons.]\n\n"
        "  [Value prop of inzicht in 1–2 zinnen.]\n\n"
        "  [CTA — één laagdrempelige vraag.]\n\n"
        "  [Handtekening]\n\n"
        "Woordtelling: [30–70 woorden.]\n\n",
        'NORMAL_TEXT'
    ))

    # TAB 4 — EXECUTION & STATUS
    blocks.append(("Tab 4 — Execution & status\n", 'HEADING_1'))
    blocks.append(("════════════════════════════════════════════════════════\n\n", 'NORMAL_TEXT'))

    blocks.append(("1. Checklist\n", 'HEADING_2'))
    blocks.append(("────────────────────────────────────────\n\n", 'NORMAL_TEXT'))
    blocks.append((
        "☐ ICP definitie goedgekeurd.\n"
        "☐ Persona profielen compleet.\n"
        "☐ Offer gedefinieerd.\n"
        "☐ Value props geschreven.\n"
        "☐ A-leads business list gedraaid.\n"
        "☐ AI validatie bedrijven uitgevoerd.\n"
        "☐ Contact list gegenereerd.\n"
        "☐ Job title AI check gedaan.\n"
        "☐ Waterfall enrichment compleet.\n"
        "☐ Messaging per persona klaar.\n"
        "☐ Copy geschreven en goedgekeurd.\n"
        "☐ Google Sheet export gemaakt.\n"
        "☐ Campagne gelanceerd.\n\n",
        'NORMAL_TEXT'
    ))

    blocks.append(("2. Resultaten\n", 'HEADING_2'))
    blocks.append(("────────────────────────────────────────\n\n", 'NORMAL_TEXT'))
    blocks.append((
        "Bedrijven gevonden:       [Aantal.]\n"
        "Bedrijven goedgekeurd:    [Aantal.]\n"
        "Contacten gevonden:       [Aantal.]\n"
        "Valide emails:            [Aantal.]\n"
        "Google Sheet:             [Link.]\n\n",
        'NORMAL_TEXT'
    ))

    blocks.append(("3. Review & approval\n", 'HEADING_2'))
    blocks.append(("────────────────────────────────────────\n\n", 'NORMAL_TEXT'))
    blocks.append((
        "☐ Accept — plan gaat de uitvoering in.\n"
        "☐ Reject — plan vervalt.\n"
        "☐ Suggest — opmerkingen hieronder.\n\n"
        "Opmerkingen:\n"
        "  [Schrijf hier feedback of aanpassingen.]\n\n",
        'NORMAL_TEXT'
    ))

    blocks.append(("4. Segmentnaamgeving\n", 'HEADING_2'))
    blocks.append(("────────────────────────────────────────\n\n", 'NORMAL_TEXT'))
    blocks.append((
        f"Klantcode:   {client_code}\n"
        f"Segment:     {campaign_name}\n"
        "Batch max:   10.000 domeinen per A-leads run.\n\n",
        'NORMAL_TEXT'
    ))

    requests = build_requests(blocks)

    docs_service.documents().batchUpdate(
        documentId=doc_id,
        body={'requests': requests}
    ).execute()

    url = f"https://docs.google.com/document/d/{doc_id}/edit"
    print(f"Template B v2: {url}")
    return doc_id, url


if __name__ == '__main__':
    create_template_b()
