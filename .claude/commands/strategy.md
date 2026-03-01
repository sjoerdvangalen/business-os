# GTM Strategy Generator

Genereer een volledige Go-To-Market strategie op basis van client research.

**Usage**: `/strategy CLIENT_CODE`

## Stappen

### 1. Voorwaarden checken
- **ALTIJD EERST** lees `~/business-os/knowledge/outbound-playbook.md` — dit is de basis voor alle strategie beslissingen
- Query `clients` waar `client_code = '$ARGUMENTS'`
- Check dat `research` JSONB niet leeg is — zo wel: "Run eerst `/research $ARGUMENTS`"
- Lees `clients.research` en `clients.onboarding_form` voor volledige context
- Lees ook `~/business-os/research/$ARGUMENTS.md` als dat bestaat

### 2. Product-Market Fit Validatie
Gebruik de gedocumenteerde PMF criteria:
- **Organische vraag**: Is er bewijs dat klanten actief zoeken naar deze oplossing?
- **Repeat purchase / retention**: Zijn er signalen van terugkerende klanten?
- **Satisfaction signals**: Reviews, testimonials, NPS indicaties?
- **Scalable economics**: Kan het bedrijf groeien zonder lineair meer kosten?

**Output:**
- Status: YES / NO / UNCLEAR
- Reasoning: 2-3 zinnen onderbouwing

### 3. Offer Analyse
Bepaal het huidige offer type:
- **Demand Generation**: Prospect weet nog niet dat ze het probleem hebben. Wij creëren bewustzijn.
- **Demand Capture**: Prospect zoekt actief naar een oplossing. Wij vangen bestaande vraag.

Documenteer de indicators die tot deze conclusie leiden.

### 4. Strategic Offer Transformation
Maak 3 offer variants gericht op **Demand Generation**:

**Per offer variant:**

**Value Propositions** (3 per offer, in Pain → Solution → Proof → Outcome format):
- **Pain**: Het specifieke probleem dat de prospect ervaart
- **Solution**: Hoe de klant dit oplost
- **Proof**: Bewijs dat het werkt (case study, data, testimonial)
- **Outcome**: Meetbaar resultaat

**Offer Details:**
- Naam (kort, krachtig)
- Headline (one-line pitch)
- Guarantee (risk reversal — wat als het niet werkt?)
- Timeline (A-to-Z: van start tot resultaat)
- CTA type: Direct / Interest / Value / Cliffhanger

**Classify per offer:**
- Approach: direct / indirect / educational
- Urgency driver: waarom nu actie ondernemen?

### 5. ICP Definitie
Definieer 1-3 Ideal Customer Profiles. Volg het ICP & Objection Mapping framework uit de knowledge base.

**Per ICP:**

**Firmographic (Primary):**
- Industry + sub-industry
- Company revenue range
- Employee count range
- Geography (landen/regio's)
- Tools & technology (tech stack indicatoren)

**Decision-Maker (Secondary):**
- Job titles (3-5 specifieke titels)
- Department
- Seniority level (C-level, VP, Director, Manager)
- Goals & pain points (wat houdt deze persoon 's nachts wakker?)
- **Personal win** (niet alleen business ROI — wat krijgt deze persoon? Promotie? Minder stress? Held zijn?)
- Buying process & decision criteria
- Market trends die hun beslissing beïnvloeden

**Qualification:**
- Ideal signals (groene vlaggen — wanneer is iemand een goede match?)
- **Buy signals** (uit knowledge base: hiring, funding, tech changes, news, etc.)
- Disqualifiers (rode vlaggen — wanneer is het geen match?)
- Buying triggers (wat maakt ze klaar om nu te kopen?)
- Common objections (welke pushback verwacht je?)
- **Objection preemption** (hoe adresseren we dit proactief in de copy?)

**Targeting Keywords:**
- About Us keywords (voor LinkedIn About filtering)
- Job description keywords (voor responsibility-based targeting)
- Signal indicators (wat scrapen we om te weten dat ze ready zijn?)

### 6. Opslaan
- Update `clients.strategy` JSONB:
```json
{
  "pmf": { "verdict": "", "reasoning": "" },
  "offer_analysis": { "current_type": "", "reasoning": "" },
  "offers": [
    {
      "name": "", "headline": "", "type": "demand_generation",
      "approach": "", "urgency_driver": "",
      "value_props": [
        { "pain": "", "solution": "", "proof": "", "outcome": "" }
      ],
      "guarantee": "", "timeline": "", "cta_type": "",
      "priority": 1, "status": "draft"
    }
  ],
  "icps": [
    {
      "name": "", "priority": 1,
      "firmographic": { "industries": [], "revenue_range": "", "employee_count": "", "geographies": [], "tech_requirements": [] },
      "decision_maker": { "titles": [], "department": "", "seniority": "", "goals": [], "pain_points": [], "buying_process": "" },
      "qualification": { "ideal_signals": [], "disqualifiers": [], "buying_triggers": [], "objections": [] }
    }
  ],
  "meta": { "generated_at": "", "version": 1, "generated_by": "claude" }
}
```
- Update `clients.onboarding_status` → `'strategy_done'`
- Log naar `agent_memory` (agent_id: 'onboarding', memory_type: 'onboarding_event')

### 7. Research .md updaten
- Append strategy sectie aan `~/business-os/research/$ARGUMENTS.md`
- Update status regel bovenaan

### 8. Presenteren
Toon de strategie in een overzichtelijk format:
- PMF verdict + reasoning
- Per ICP: samenvatting van wie we targeten
- Per offer: naam + headline + value prop samenvatting
- Vraag Sjoerd welke offers hij wil goedkeuren voor copy
- Na approval: suggereer `/copy $ARGUMENTS`
