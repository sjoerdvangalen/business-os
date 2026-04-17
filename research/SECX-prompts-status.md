# SentioCX Prompts Status & Roadmap

> Laatst bijgewerkt: 2026-03-29

---

## Wat is VOLTOOID

### 1. HUIDIG Style + CX Leadership Persona (DONE)
**Bestand:** `research/SECX-prompt-HUIDIG-CX-v5.md` (hieronder opgeslagen)

**Getest op:** 30 bedrijven uit de Salesforce Service Cloud lijst
- Hays, Bullhorn, City National Bank, Smartcat, ALTEN
- OpenAI, Snowflake, Solera, Randstad (x3), CONMED, Salt
- Napoleon, Quantum, PenFed, Axon, Lucid Motors, Flagstar
- VDart, Natera, NinjaTrader, Vercel (x2), ALSAC, Dexian
- Aristocrat

**Score:** 8.2/10
- Context-behoud: ✅ (schaal + locatie in bullet 1)
- Punt aan einde: ✅
- Juiste outcome per industrie: ✅
- "Seamless" altijd aanwezig: ✅
- Geen adjectives: ✅ (bijna altijd)
- Geen dubbele logica: ✅

---

## Wat MOET NOG (7 items)

| # | Taak | Prioriteit | Schatting |
|---|------|-----------|-----------|
| 1 | **ERIC prompt + CX Leadership** | HOOG (morgen) | 1-2 uur |
| 2 | HUIDIG prompt + OPS (Contact Center Ops) | MIDDEL | 1 uur |
| 3 | ERIC prompt + OPS | MIDDEL | 1 uur |
| 4 | HUIDIG prompt + TECH (Digital/Tech) | MIDDEL | 1 uur |
| 5 | ERIC prompt + TECH | MIDDEL | 1 uur |
| 6 | HUIDIG prompt + CSUITE (C-Suite Efficiency) | LAAG | 1 uur |
| 7 | ERIC prompt + CSUITE | LAAG | 1 uur |

**Totaal:** 7 prompts nog te bouwen

---

## Persona Context (voor morgen/herinnering)

### CX Leadership (DONE voor HUIDIG)
- Focus: Experience, satisfaction, NPS
- Start woorden: Connect, Elevate, Reduce
- Value props: Connect X to Y without delays, Match automatically, Cut/Reduce Z

### OPS (Contact Center Ops) - TODO
- Focus: Handle times, SLAs, FCR (First Contact Resolution)
- Start woorden: Route, Match, Handle
- Value props: Route automatically, Match by intent to cut metric, Hit targets without hiring

### TECH (Digital/Tech) - TODO
- Focus: Integration, automation, APIs
- Start woorden: Automate, Integrate, Deploy
- Value props: Automate routing via API, Deploy without rebuild, Integrate in days not months

### CSUITE (C-Suite Efficiency) - TODO
- Focus: Cost, efficiency, ROI
- Start woorden: Cut, Scale, Deliver
- Value props: Cut costs X% without quality loss, Scale 2x without headcount, Deliver at lower cost per unit

---

## Reverse Engineering Plan (einddoel)

Wanneer alle 8 prompts klaar zijn (1 done + 7 todo):

1. **Analyseer patronen** per persona:
   - Welke woorden werken voor CX vs OPS vs TECH vs CSUITE?
   - Welke pijnpunten zijn persona-specifiek?

2. **Matrix opstellen**:
   - 4 personas × 6 verticals = 24 campaign cells
   - Per cel: geteste value props

3. **Clay prompt bouwen**:
   - 1 prompt die alle 24 cells kan genereren
   - Input: company description + vertical + persona
   - Output: 3 bullets in juiste stijl

4. **Tanstackbuilder integratie**:
   - Frontend: persona selector + company input
   - Backend: prompt execution via Kimi API
   - Output: 3 editable bullets

---

## Bestanden Locaties

| Bestand | Status | Pad |
|---------|--------|-----|
| HUIDIG-CX V5 prompt | ✅ Done | `research/SECX-prompt-HUIDIG-CX-v5.md` |
| ERIC-CX prompt | 📝 TODO | `research/SECX-prompt-ERIC-CX-v1.md` |
| HUIDIG-OPS prompt | 📝 TODO | `research/SECX-prompt-HUIDIG-OPS-v1.md` |
| ERIC-OPS prompt | 📝 TODO | `research/SECX-prompt-ERIC-OPS-v1.md` |
| HUIDIG-TECH prompt | 📝 TODO | `research/SECX-prompt-HUIDIG-TECH-v1.md` |
| ERIC-TECH prompt | 📝 TODO | `research/SECX-prompt-ERIC-TECH-v1.md` |
| HUIDIG-CSUITE prompt | 📝 TODO | `research/SECX-prompt-HUIDIG-CSUITE-v1.md` |
| ERIC-CSUITE prompt | 📝 TODO | `research/SECX-prompt-ERIC-CSUITE-v1.md` |
| Test vergelijking | ✅ Done | `research/SECX-test-vergelijking.md` |
| Clay prompt research | 🗑️ Verwijderd | Clay integratie verlaten |
| Campaigns reference | ✅ Done | `research/SECX-campaigns.md` |
| Status/roadmap | ✅ Done | `research/SECX-prompts-status.md` (dit bestand) |

---

## Context voor Morgen (ERIC + CX)

Wat we weten over ERIC-stijl vs HUIDIG:

| Aspect | HUIDIG (product-feature) | ERIC (actiegericht) |
|--------|-------------------------|---------------------|
| Focus | Wat het product doet | Wat de klant bereikt |
| Start woorden | Improve, Deliver | Connect, Match, Handle |
| Toon | Passief | Actief |
| Voordeel | Abstract | Concreet (no headcount, no delays) |
| Voorbeeld | "Improve placement speed with..." | "Connect candidates directly to..." |

**Morgen:** Bouw ERIC-CX prompt die dezelfde 30 bedrijven test, maar dan met actiegerichte taal.

---

## Oude/Irrelevante Context (te negeren/archiveren)

De volgende context is nu vervangen door dit statusbestand:
- V1-V4 prompts (vervangen door V5)
- Oude todo items (vervangen door 7-item lijst hierboven)
- EIGEN-stijl discussie (niet meer relevant, alleen HUIDIG vs ERIC)

Focus morgen: **ERIC + CX Leadership prompt bouwen en testen.**
