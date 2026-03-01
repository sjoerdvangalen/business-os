# Deep Client Research

Voer een uitgebreide company research uit voor een klant en sla de resultaten op.

**Usage**: `/research CLIENT_CODE`

## Stappen

### 1. Client opzoeken
- Query Supabase `clients` tabel waar `client_code = '$ARGUMENTS'` (hoofdletters)
- Als niet gevonden: stop en meld de fout
- Lees de bestaande velden: `name`, `domain`, `linkedin_url`, `onboarding_form`
- Check of er al research bestaat (`research` JSONB niet leeg) — zo ja, meld dat dit een refresh is

### 2. Onboarding formulier check
- Als `onboarding_form` JSONB leeg is: vraag Sjoerd om de volgende info te geven:
  - Wat doet het bedrijf? (product/dienst beschrijving)
  - Wie is hun doelgroep?
  - Wat is hun waardepropositie?
  - Wie zijn hun concurrenten?
  - Wat is hun pricing model?
  - Bijzonderheden of speciale instructies?
- Sla de antwoorden op in `clients.onboarding_form` JSONB
- Als `onboarding_form` al gevuld is: gebruik die data als startpunt

### 3. Deep Research uitvoeren
Gebruik web search om het volgende te onderzoeken:

**Company Profile:**
- Bedrijfsnaam, website, oprichtingsjaar
- Bedrijfsgrootte (werknemers), hoofdkantoor
- Industrie en sub-industrie
- Korte bedrijfsbeschrijving (1-2 zinnen)

**Business Model:**
- Type: SaaS, Services, Marketplace, Manufacturing, etc.
- Revenue model: subscription, retainer, project-based, etc.
- Pricing indicatie
- Target market: SMB, Mid-market, Enterprise

**Marktpositie:**
- Top 3-5 concurrenten met korte beschrijving
- Unieke differentiators (wat maakt ze anders)
- Relevante markttrends
- Recent nieuws (laatste 6-12 maanden)

**Digital Presence:**
- LinkedIn profiel + aantal followers
- Andere social media kanalen
- Content strategie (blog, podcast, social, geen)
- Tech stack (als detecteerbaar)

**Opportunities:**
- Waarschijnlijke pain points van hun klanten
- Growth signals (hiring, funding, nieuwe producten, expansie)

**PMF Assessment:**
- **Verdict**: YES / NO / UNCLEAR
- **Reasoning**: Gebaseerd op: organische vraag, terugkerende klanten, tevredenheidssignalen, schaalbare economics
- Gebruik de onboarding_form data + research bevindingen

### 4. Opslaan
- Update `clients.research` JSONB met gestructureerde data:
```json
{
  "company_profile": { "name": "", "website": "", "founded": "", "size": "", "hq": "", "industry": "", "sub_industry": "", "description": "" },
  "business_model": { "type": "", "revenue_model": "", "pricing": "", "target_market": "" },
  "market_position": { "competitors": [], "differentiators": [], "market_trends": "", "recent_news": "" },
  "digital_presence": { "linkedin_url": "", "linkedin_followers": 0, "social_channels": {}, "tech_stack": [], "content_strategy": "" },
  "opportunities": { "pain_points": [], "growth_signals": [] },
  "pmf": { "verdict": "", "reasoning": "" },
  "meta": { "researched_at": "", "version": 1, "sources": [], "researched_by": "claude" }
}
```
- Update `clients.onboarding_status` → `'researched'`
- Update `clients.onboarding_started_at` als het de eerste keer is
- Log naar `agent_memory` (agent_id: 'onboarding', memory_type: 'research_log')

### 5. Research .md schrijven
- Schrijf volledige research naar `~/business-os/research/$ARGUMENTS.md`
- Format: leesbaar markdown met headers per sectie
- Bovenaan: `> Status: researched | Researched: [datum] | Version: 1`

### 6. Presenteren
- Geef een samenvatting van de belangrijkste bevindingen
- Highlight de PMF assessment
- Vraag of Sjoerd wil aanvullen of door wil naar `/strategy $ARGUMENTS`
