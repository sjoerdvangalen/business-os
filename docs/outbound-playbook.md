# Outbound & Cold Email Playbook — VGG Acquisition Knowledge Base

> Consolidated intelligence from GEX (Eric), Nick Abraham (Leadbird/OutboundContent), Fivos Aresti (GTM Scaling), and the Cold Email v2 system. This is the single source of truth for all outbound strategy, copy, and execution decisions.

---

## Part 1: Core Philosophy

### The Hierarchy of What Matters

```
1. OFFER (is it cold-traffic ready?)
2. TARGETING (right companies + right people)
3. SIGNAL (buy signal / trigger event)
4. MESSAGING (copy that matches the signal)
5. INFRASTRUCTURE (deliverability, domains, warmup)
```

**The offer is everything.** No amount of personalization saves a weak offer. A strong offer with mediocre copy outperforms clever copy with a vague offer. Personalization on a bad offer only gets you so far.

### What "Good" Looks Like

- **Message-market fit before cleverness**: Show you understand the person/company immediately
- **Research IS the personalization**: Custom signals prove you did your homework
- **One job per email**: Single sharp question or CTA
- **Evidence-led angles**: Competitor deltas, stack reveals, hiring signals, recent content, outcomes
- **Earn replies, not just meetings**: Confirm situation before selling
- **Plain text, conversational, zero fluff**: Every word must earn its place

### Signal-Based Outbound (Our Core Model)

The system works in this order:

```
1. Build business database with buy signals
2. Find contacts at those businesses
3. Approach with a problem statement connected to their trigger
4. Position client's solution as the answer
```

**Example**: Tech companies hiring an SDR = they're seeking pipeline growth. We deliver that, so we approach with: "Noticed you're hiring for a {{title}} — looks like pipeline growth is a priority. We help similar teams add 15+ qualified meetings/month without adding headcount."

---

## Part 2: Targeting & List Building

### The Targeting Stack (in order of priority)

1. **Company-level signals** (hiring, funding, tech changes, news)
2. **Industry + sub-industry filtering** (NAICS + keyword-based)
3. **Role/department targeting** (decision maker + influencer)
4. **Firmographic filters** (size, revenue, geography)

### List Quality > List Size

**The LinkedIn "About Us" Hack (Nick Abraham)**
Instead of relying on inaccurate industry codes from data providers:

1. Enrich company LinkedIn URLs to pull About Us descriptions
2. Pick 3-5 dream accounts, extract their keywords
3. Build keyword filter: `aboutus_text CONTAINS ("keyword1", "keyword2"...)`
4. Combine with industry filter for 90-95% accuracy (vs 50-60% with industry codes alone)

**Responsibility-Based Targeting (for ambiguous products)**
When there's no clear buyer title:

1. Filter by department (narrow the universe)
2. Filter by LinkedIn description keywords (isolate the actual doer)
3. Target people who describe your problem in their own words

### Identifying the Right Person

- **Department filter** narrows possible universe
- **Description keyword filter** isolates the actual responsible person
- Build keyword library: "What words would someone use when describing the job my tool automates?"

### Data Quality Rules

- Clean formatting: No raw "LLC"/"Inc." in company names, no "Chief Executive Officer" — keep natural
- Diversify ISPs: 2 Google contacts for every 1 Outlook
- Push Mimecast/Proofpoint contacts to bottom of CSV (harder to land)
- Always validate with email verification before launch
- Separate catch-all emails into their own campaigns
- Run employment checks at scale to remove job-changers (scrape LinkedIn current company vs. your data)

### Source Priority for Lead Data

1. **Signal-triggered lists**: Companies showing active buy signals (best)
2. **Intent data lists**: Companies researching relevant topics
3. **Firmographic lists**: Right size/industry but no signal (baseline)
4. **Scraped lists**: Industry directories, events, etc. (supplementary)

### Signal Tiers

Signal tier bepaalt hook_variant, offer_variant, cta_variant, sequence lengte, en kill logic per cell.

```
Tier 1   High intent trigger
         Actief signaal, bewijs van urgentie nu.
         Voorbeelden: recent funding, active hiring voor target rol, product launch, churn reviews.
         → hook_variant: signal_observation
         → offer_variant: outcome_led
         → cta_variant: direct_meeting of info_send, korte sequence (2-3 stappen)

Tier 2   Warm trigger / problem evidence
         Indirect bewijs van relevant probleem.
         Voorbeelden: headcount groei, tech stack hints, G2 reviews, nieuws.
         → hook_variant: signal_observation of poke_the_bear
         → offer_variant: outcome_led of problem_led
         → cta_variant: info_send of case_study_send, standaard sequence

Tier 3   Qualified no trigger
         Firmografisch fit, geen zichtbaar signaal gevonden.
         → hook_variant: problem_hypothesis of proof_led
         → offer_variant: problem_led of outcome_led
         → cta_variant: soft_confirm of info_send, langere sequence, ruimere pilotperiode

Tier 4   Experimental hypothesis
         Onzeker fit — nieuwe vertical of ICP die nog niet bewezen is.
         → Observationeel, kleine batch (<50), geen volume tot data een patroon bewijst
```

**Praktisch gebruik:**
- Tier 1/2 signalen → cell is klaar voor H1 zodra infra groen is
- Tier 3 cells → start pas na Tier 1/2 baseline data (2+ weken)
- Tier 4 → apart gemarkeerd in campaign_cells.brief, nooit tegelijk met Tier 1/2 schalen

## Hook Variants, Offer Variants & CTA Variants

### Hook Variants (opening frame)

| Variant             | When to use                                              |
|---------------------|----------------------------------------------------------|
| signal_observation  | Tier 1/2 — open with the specific trigger observed       |
| data_observation    | data_driven — open with dataset fact / benchmark gap     |
| problem_hypothesis  | Tier 3 — hypothesize the pain without confirmed signal   |
| poke_the_bear       | Tier 2/3 — provocative observation to surface the pain   |
| benchmark_gap       | Any — open with industry/competitor benchmark difference |
| proof_led           | Any — open with case study / result / proof point        |

proof_led as hook: the opening starts with proof, case, benchmark, or precedent.

### Offer Variants (value prop framing)

| Variant        | When to use                                                  |
|----------------|--------------------------------------------------------------|
| outcome_led    | Result central — "23% churn reduction in 90d"               |
| problem_led    | Pain central — "your team is doing X manually"              |
| insight_led    | Observation central — "companies hiring for X usually see Y" |
| proof_led      | Evidence central — competitor/client precedent               |
| diagnostic_led | Question central — "what's your current X?"                 |

proof_led as offer: the value prop is framed via proof, precedent, or social proof.

### CTA Variants

| Variant          | Signal tier | When to use                            |
|------------------|-------------|----------------------------------------|
| direct_meeting   | Tier 1      | High-intent signal, clear urgency      |
| info_send        | Tier 1/2    | Default H1/F1 CTA-lock                 |
| case_study_send  | Tier 2      | Social proof CTA for warm triggers     |
| diagnostic_offer | data_driven | Dataset-led diagnostic question        |
| soft_confirm     | Tier 3      | Low-friction confirmation for cold     |

**CTA-lock tijdens H1/F1:** alleen `info_send` of `case_study_send`. Geen `direct_meeting` tot na F1 winner. (Authoritative: ROADMAP.md test discipline.)

### Default variant sets per campaign_archetype

matrix_driven:
  hooks: signal_observation, problem_hypothesis, benchmark_gap
  offers: outcome_led, problem_led
  CTAs: info_send, case_study_send (H1/F1 lock)

data_driven:
  hooks: data_observation, benchmark_gap
  offers: diagnostic_led, insight_led
  CTAs: diagnostic_offer, soft_confirm

signal_driven:
  hooks: signal_observation
  offers: outcome_led
  CTAs: direct_meeting (Tier 1), info_send (Tier 2)

---

## Part 3: Research Method

### The 10-Minute Research Framework

Complete this sentence first:
> "The ideal prospect would show evidence of **[specific behavior/change/problem]** because it means they're experiencing **[pain]** right now."

### Research Tiers (spend max 10 min per prospect)

**Tier 1: Case Studies (3 min) — START HERE**
- Company website → case studies/customers page
- Extract: customer type, problem, metric, outcome, timeframe
- Pattern: "Most [customer type] see [result] within [timeframe]"

**Tier 2: Custom Signals (6-7 min) — THE DIFFERENTIATOR**
Signal hunting by target function:
- **Selling to sales**: Hiring velocity, G2 reviews, job posts mentioning quotas
- **Selling to marketing**: SimilarWeb competitor data, pricing page analysis, ad creative
- **Selling to ops**: GitHub repos, Zapier templates, manual processes in job posts
- **Selling to local businesses**: Google reviews (negative = opportunity), follower counts
- **Selling to SaaS**: Pricing tiers, LinkedIn posts, funding news

**Tier 3: Standard Variables (3-4 min) — BACKUP**
- LinkedIn: role, tenure, recent posts
- Company site: blog, press, events
- Hiring page: open roles, department growth
- Tech stack: BuiltWith, job descriptions

**Decision tree:**
- Found Tier 1 or 2 signal → Write the email
- Found only Tier 3 → fallback: hook_variant = problem_hypothesis or proof_led, offer_variant = problem_led or outcome_led, cta_variant = soft_confirm or info_send
- Found nothing after 10 min → Skip or use fallback campaign

### Custom Signal Categories (for Clay enrichment)

| Signal Type | Source | Variable Example |
|------------|--------|-----------------|
| Hiring spike | LinkedIn/job boards | `{{hiring_roles}}`, `{{open_roles_count}}` |
| Funding round | Crunchbase/news | `{{press_headline}}`, `{{funding_amount}}` |
| Tech stack change | BuiltWith/job posts | `{{stack_crm}}`, `{{stack_marketing}}` |
| Competitor mention | G2/website | `{{competitor}}`, `{{competitor_review}}` |
| Content activity | LinkedIn/blog | `{{recent_post_topic}}`, `{{days_since_post}}` |
| Review sentiment | Google/G2/Yelp | `{{negative_review}}`, `{{review_summary}}` |
| Promotion/new role | LinkedIn | `{{new_title}}`, `{{tenure_months}}` |
| Web traffic trend | SimilarWeb | `{{traffic_trend}}`, `{{visitor_count}}` |
| Ad activity | LinkedIn/Meta | `{{ad_summary}}`, `{{ad_platform}}` |
| Company mission | LinkedIn About | `{{ai_customer_type}}`, `{{company_mission}}` |

---

## Part 4: Email Copy Framework

### The Golden Rules

1. **50-90 words** for first email (priority target), 60-120 words max
2. **Plain text only** — no images, PDFs, or links in first email
3. **Never start with "I"** — start with THEM
4. **One CTA per email** — reply in 5 words or less
5. **Subject lines: 1-4 words** (or proof_led/problem_hypothesis approach)
6. **No fluff**: Delete "I hope this finds you well", "I wanted to reach out", "We help companies..."
7. **Spintax everything**: Even signatures, to create natural variation
8. **Don't track opens**: Unreliable data + hurts deliverability

### Email Structure

```
LINE 1: Situation Recognition (1 sentence)
→ Describe THEIR exact situation. Be direct. Use {{signal}}.

LINE 2: Value Prop + Proof (1-2 sentences MAX)
→ What you do + metric. No fluff.

OPTIONAL: The "Specifically" Line (1 sentence)
→ "Specifically, it looks like you're trying to sell to {{customer_type}}"

LINE 3: Low-Effort CTA (1 sentence)
→ Binary question or simple offer.
```

### The "Specifically" Line (3x Conversion Booster)

When your service applies universally but companies do different things:
> "Specifically, it looks like you're trying to sell to {{customer_type}}, and we can help with that."

- Use for: outbound agencies, newsletters, marketing services
- Don't use for: obvious target markets (vacuum cleaners → hotels)
- Why: Shows you understand THEIR business, not just yours

### Subject Line Strategy

**Approach A: 2-4 Words (Intrigue)** — Best with custom signals
- "Partnership?", "Quick question", "Outbound edge", "Saw your post"
- Test: Can a colleague or customer send this? If yes, good.
- Best-ever example: "pizza orders" (for pizza restaurants about increasing orders)

**Approach B: Offer in Subject + Preview** — Best with limited data (proof_led or problem_hypothesis hook)
- Subject: "Ever chase renters to pay on time?"
- Preview: "We built a platform that rewards renters for paying on time"

**Rules:**
- No punctuation in subject lines
- No ALL CAPS, no clickbait
- Match subject to email content (no bait-and-switch)

### The 3-Pass Cutting Process

After drafting, cut 40-45% total:

**Pass 1: Delete fluff (cut 20%)**
- Remove all greetings and pleasantries
- Remove "I wanted to" / "I was wondering" / hedging words
- Remove corporate speak ("solutions", "innovative", "cutting-edge")

**Pass 2: Compress sentences (cut 15%)**
- Replace clauses with periods
- "We built a platform that can do X" → "We do X"
- Combine redundant ideas

**Pass 3: Cut adjectives (cut 10%)**
- Keep only data-specific adjectives ("4.7x", "Series B", "23%")
- Delete vague ones ("great", "amazing", "powerful", "robust")

### Compression Tactics

- Kill intro phrases: Just start with the point
- Em dashes > commas: "Saw your post—noticed it was {{days}} days since the one before."
- Delete "that" and "which": "We pull everyone engaging..."
- Active voice always: "Starter gives platform access" not "Starter is focused on getting people access"
- Numbers > words: "3x" not "three times", "30 days" not "thirty days"

### CTA Categories

**Category 1: Confirmation (Earn Reply)**
- "Is this still the case?"
- "Worth exploring?"
- "Curious — are you already doing X?"

**Category 2: Value-Exchange (Why Meet)**
- "...so I can walk you through 3 custom ideas specific to {{company}}"
- "...to share what's working in the {{industry}} industry right now"
- "Would it make sense to chat about this?"

**Category 3: Resource Offer (Low Commitment)**
- "Could I send you access?"
- "No need to hop on a call — could I send a video of how it works?"
- "Want the 1-pager — no pitch, just the framework?"

**Category 4: Soft Ask (GEX GTM Prompts Style)**
- "Worth a 2-minute look if I send it?"
- "Open to a quick benchmark to compare against peers?"
- "Should I send the teardown for {{system_or_process}}?"

**The CTA Test:** Can they reply in 5 words or less? If not, simplify.

**NEVER use:**
- "Can we schedule 15 minutes?"
- "Are you available for a quick call?"
- "Let's chat sometime"
- "Would love to connect"

### Opener Patterns ("Poke the Bear")

| Pattern | Example |
|---------|---------|
| Classic | "Do you already have a reliable way to {{problem}}?" |
| Status Pressure | "Have you figured out how to {{outcome}} without adding headcount?" |
| Soft Humility | "Totally possible you solved this — how do you handle {{process}} today?" |
| Efficiency | "What's your process for {{task}} without manual work?" |
| Risk-Based | "How are you avoiding {{negative_outcome}} as you scale?" |
| Binary | "Is your process for {{area}} where you want it?" |
| Redirect | "Let me know if {{employee_1}} or {{employee_2}} would be better to speak about this." |

---

## Part 5: Campaign Types

### 1. Custom Signal Campaign
**When**: Strong research data (case studies, pricing insights, reviews, hiring)
```
Subject: 2-4 words, intriguing
First line: Custom signal with {{variable}}
Body: Value prop + case study proof
CTA: Low-effort question
```

### 2. Creative Ideas Campaign
**When**: You can generate specific, credible ideas for them
```
{{First_name}} — I was on the site and saw how you help {{ai_mission}}
and had some ideas for you.

• Idea 1: [Action using Feature X] — would help with [their pain]
• Idea 2: [Action using Feature Y] — could improve [their goal]
• Idea 3: [Action using Feature Z] — might address [their challenge]

Of course, I wrote this without knowing your current bottlenecks.
If it's interesting, we could hop on a call and I'd share what's
working in the {{industry}} industry.
```
**Critical**: Ideas must be credible (feature-constrained) and specific to them.

### 3. Fallback Variant Campaign (proof_led / problem_hypothesis)
**When**: Limited data or self-selecting offer (Tier 3 / data_driven archetype)
- hook_variant: problem_hypothesis or proof_led
- offer_variant: problem_led or outcome_led
- cta_variant: soft_confirm or info_send
- Subject: Describes the pain/outcome (can be longer than 4 words)
- Preview text: Completes the offer
- Body: Explain offer, add light personalization if possible
- CTA: Simple yes/no

### 4. Fallback / Redirect Campaign
**When**: Not 100% sure they're the right person
```
{{First_name}} — let me know if {{employee_1}} or {{employee_2}}
would be better to speak about {{specific_problem}}.
```

### 5. Lead Magnet Campaign
**When**: You have a genuinely valuable resource to give
```
{{First_name}} — I saw {{something relevant}}.
We help companies achieve {{results}}.

But I'd never expect you to believe me without giving you something first.
I made you a {{resource}} and I wondered if you'd let me know
if it was useful and then maybe we could chat?
```

---

## Part 6: Follow-Up Sequence

### Sequence Philosophy

Short sequences work best. If someone follows up in a thread multiple times, it's just a reminder they already ignored you. Structure: **email → follow-up in thread → net new email → follow-up in thread**.

### Email 1 (Day 0)
- New subject line
- Full campaign (research + value prop + CTA)
- Try to earn reply

### Email 2 (Day 3-4) — In-thread follow-up
- **No new subject line** (threads in sequencer)
- **Different value proposition** — they didn't reply = that angle didn't resonate
- Rotate through: save time, save money, make money
- Creative ideas variant works well here
- Lower friction on CTA

### Email 3 (Day 7-8) — New thread
- **New subject line** (fresh thread)
- Different case study or angle
- Consider dropping ALL AI personalization
- hook_variant = proof_led or problem_hypothesis, offer_variant = problem_led, cta_variant = soft_confirm (punchy + direct)
- Could reference their colleagues: "Let me know if {{employee_1}} or {{employee_2}} would be better"

### Email 4 (Day 11-12) — Breakup / Value-add
- Final email, keep it friendly
- Redirect to another person OR offer resources
- "Not the right time? No problem."
- Creative: pull prospects matching THEIR ICP and send as value:
```
{{First_name}} — Last email. I figured you sell to {{customer_types}}.
I went ahead and pulled them off LinkedIn for you.

{{Contact}} — {{LinkedIn}} — {{Email}}
{{Contact}} — {{LinkedIn}} — {{Email}}
{{Contact}} — {{LinkedIn}} — {{Email}}

Want to see a video of how I did this automatically?
```

---

## Part 7: Personalization Line Library

### Lines from scraped data (no AI needed)

| Personalization Type | Template |
|---------------------|----------|
| Company mission | "I saw how you help people {{mission}}..." |
| Title + tenure | "Noticed you've been the {{title}} for about {{time}} years..." |
| Previous company | "I figured you didn't leave {{prev_company}} stoked to worry about {{problem}}." |
| Recommendation | "Saw the recommendation {{name}} left about how you {{summary}}. Kudos!" |
| LinkedIn post | "Saw your post about {{summary}}." |
| Company news | "Saw the recent news about {{ai_summary}}." |
| Google reviews | "Noticed the 4.8 star reviews you all have." |
| Negative review | "Saw the review about {{summary}}." |
| Tech stack | "I used BuiltWith and noticed you had a history of using {{tech}}." |
| Hiring signal | "Noticed you're hiring for a {{title}}." |
| Job description keyword | "...and the job description mentioned {{keyword}}." |
| New leadership | "Noticed {{new_leader}} recently joined the team." |
| Competitor | "{{source}} told me people often compare you to {{competitor}}." |
| Web traffic | "Similar web said you had around {{number}} visitors per month." |
| Promotion | "Noticed you recently took over as {{title}}." |
| Google Ads | "Noticed you're bidding on keywords like {{keywords}}." |
| Social ads | "I saw your ad about {{ad_summary}}." |
| Case study on site | "Saw you've created success for companies like {{case_study}}." |
| Local restaurant | "Based in {{location}}? Happy to buy you lunch at {{restaurant}}!" |
| Phone number | "I was about to call {{phone}} but figured email would be easier." |
| People Also Viewed | "LinkedIn pushed me to your profile after researching {{person_1}} and {{person_2}}." |
| College event | "Noticed you went to {{college}} — do you ever go back for {{event}}?" |
| Company analogy | "A good way to think about us is the same way you help people {{how_they_help}}, we help {{how_we_help}}." |
| eCommerce AOV | "Looked at your site — average order is about {{value}} considering {{items}}." |
| SEO ranking | "Did a search for {{keywords}} and saw you ranked {{rank}}." |
| Screenshot | Attach screenshot of their page with annotation |
| Page keyword | "I noticed on your site you mention {{keyword}} on this page: {{link}}" |

### AI-generated lines (via Clay/Claygent)

| Variable | What it generates |
|----------|------------------|
| `{{ai_customer_type}}` | "VPs of Finance" or "fitness enthusiasts" |
| `{{ai_customer_description}}` | "professional men looking for classic styles" |
| `{{ai_generation}}` | Flexible contextual line from website/LinkedIn |
| `{{creative_ideas}}` | 3 bullet-point ideas constrained to your features |

### Personalization Accuracy Warning (Nick Abraham)

AI-generated personalization is ~85-90% accurate. That 10-15% inaccuracy can tank campaigns at scale. Always:
- Build strict checks and balances into enrichment
- Never let AI run unchecked into client-facing campaigns
- Prefer scraped data + simple AI generation over complex Claygent prompts
- Manual spot-check at least 10% of AI-generated lines

---

## Part 8: ICP & Objection Mapping

### Before Writing ANY Campaign

**Step 1: Role-Play the Skeptical ICP**
1. How are they doing this now? (Current state, existing tools)
2. Why would they switch? (What's broken?)
3. What objections will they have? ("We already have X", "No budget", "We tried this")
4. What's their switching cost? (Time, money, political capital)

**Step 2: Personal Benefit (Not Just Business ROI)**
Unless they're the CEO, they want to:
- Do their job and leave on time
- Look smart to their boss
- Avoid extra work
- Get promoted

Add to every campaign:
- **Business win**: What the company gets
- **Personal win**: What THEY get

**Step 3: Preempt Objections in Copy**
- "We already have a solution" → "Have you figured out how to do X without adding headcount, or is it still manual?"
- "Sounds expensive" → Mention case study ROI or "you only pay when..."
- "We're too busy" → "This would save your team time by automating [specific task]"

---

## Part 9: Infrastructure & Deliverability

### Email Infrastructure Rules (Fivos Aresti + Nick Abraham)

| Rule | Details |
|------|---------|
| Max emails per mailbox | 25/day (Fivos) — max 30 at scale |
| Mailboxes per domain | 2 max |
| Provider split | 50% Google / 50% Microsoft |
| Warmup period | Minimum 2 weeks, ideally 1 month |
| Rotation | Buy 2 sets of infra/month. Rotate: one sends while other warms |
| Tracking | Don't track opens — hurts deliverability |
| Format | Plain text only, no HTML formatting |
| Links | No links in first email |
| Spintax | Randomize everything including signatures |
| DNS | Always verify SPF, DKIM, DMARC before going live |
| Emergency | Keep non-branded backup domains ready |
| Domains | .com preferred, .org/.info/.co as backups |
| Best send day (SMB) | Saturdays often outperform weekdays |

### Deliverability Measurement

- **Only reliable metric**: Reply rate
- **Minimum test volume**: 1,000 emails, wait 48 hours
- **Red flag**: < 1% reply rate = likely deliverability problem
- **Better rule**: Compare per-domain reply rate to average. If 50%+ below average → investigate
- **Combined rule**: Below 1% reply rate AND bounce rate above 3% → shut down domain

### Domain Health Management

- Track reply rate per domain vs. average
- If domain is 33%+ below average → run inbox placement test
- If placement test shows spam → kill domain and reorder
- Replace burned domains immediately (keep pipeline of warming domains)

---

## Part 10: Multi-Channel GTM (Fivos Aresti Model)

### The 4-Channel Approach

```
Cold Email → primary volume driver
Cold Call → highest conversion per touch
LinkedIn → relationship builder + research
Manual Tasks → personalized touchpoints
```

### Channel Routing (Nick Abraham MVP)

```
Raw Leads
  → Email Validation (MillionVerifier)
    → Valid → Cold Email (EmailBison)
    → Catch-All → Scrubby validation
      → Valid → Cold Email
      → Invalid → Phone enrichment (LeadMagic)
        → Phone found → Cold Call (Salesfinity)
        → No phone → LinkedIn (HeyReach)
```

### Multi-Threading (Fivos)

- Reach 3-5 stakeholders per account
- Different messaging per role level
- VP gets strategic angle, Manager gets tactical angle
- Creates internal conversation about your solution

### Attribution Beyond Replies

Track outbound influence on:
- Website visits post-outreach
- LinkedIn connection accepts
- Inbound inquiries from target accounts
- Conference conversations
- Referral introductions from contacted accounts

---

## Part 11: Offer Design for Cold Traffic

### Cold-Traffic-Ready Test

If someone got your message out of nowhere, would they immediately understand the value? Would they say "Yeah, I want that"?

**Cold-ready**: "We help B2B agencies get 10 qualified appointments per month, guaranteed"
**Not cold-ready**: "We help businesses with marketing automation and process optimization"

### Offer Types (GTM Prompts Framework)

**Front-End Offers (Low Commitment Entry)**
- `[Audit]` 5-point deliverability audit for {{company}} (24 hrs)
- `[Playbook]` 2-page {{role}} outreach sequence (ready to paste)
- `[Calculator]` ROI model using your {{primary_kpi}} inputs
- `[Teardown]` Loom review of {{process/tool}} with prioritized fixes
- `[Benchmark]` Peer comparison using {{industry}} data (3 charts)

**Demand Gen vs. Demand Capture**

| Demand Gen (create awareness) | Demand Capture (harvest intent) |
|------------------------------|-------------------------------|
| The prospect doesn't know they have a problem | The prospect is actively looking for a solution |
| Lead with education + insight | Lead with proof + results |
| Lower conversion, higher volume | Higher conversion, lower volume |
| Front-end offers work best | Direct offers work best |

### Offer Analysis Per Client

For every client, answer:
1. Is the offer cold-traffic ready? (Simple, obvious, 10-second value)
2. Is it demand gen or demand capture?
3. What's the proof? (Case study, metric, guarantee)
4. What's the personal win for the decision-maker?
5. What's the front-end offer to lower the barrier?

---

## Part 12: QA & Scoring

### QA Checklist (Run Before Sending)

**Personalization:**
- [ ] First line references specific signal or AI insight
- [ ] Variables use `{{double_braces}}` format
- [ ] No hallucinations (verify all facts)

**Banned Phrases:**
- [ ] No "I hope this email finds you well"
- [ ] No "I wanted to reach out"
- [ ] No "We help companies..." (unless backed by case study immediately)
- [ ] No starting with "I" or "My name is"

**Length & Clarity:**
- [ ] 50-90 words (or 60-120 max for complex offers)
- [ ] Plain text, no fluff
- [ ] Reads naturally aloud

**Tone:**
- [ ] Helpful, confident, conversational
- [ ] About THEM (not about you)
- [ ] 100% recipient-focused

**CTA:**
- [ ] One clear CTA
- [ ] Low-effort (reply in 5 words or less)
- [ ] Value-exchange if asking for meeting

**Technical:**
- [ ] Em dashes are "—" (not "--" or "–")
- [ ] No double spaces
- [ ] Variables closed correctly
- [ ] Mobile-friendly (short paragraphs, max 2 sentences each)

### Scoring Rubric (0-100)

| Dimension | Weight | What's Measured |
|-----------|--------|----------------|
| Situation Recognition | 25 pts | Specific data about them? |
| Value Clarity | 25 pts | Clear offer + proof? |
| Personalization Quality | 20 pts | Custom signal OR AI insight? |
| CTA Effort | 15 pts | 5 words or less to reply? |
| Punchiness | 10 pts | 50-90 words? No fluff? |
| Subject Line | 5 pts | 2-4 words OR proof_led/problem_hypothesis? |

**85+ = Ship it | 70-84 = Needs one more pass | <70 = Start over**

---

## Part 13: GTM Research Pipeline

### Step-by-Step Research Flow (for new client onboarding)

**Step 1: Deep Market Research**
- Company profile, business model, market position
- Competitors, pain points, growth signals, tech stack
- PMF assessment: Is this offer cold-traffic ready?

**Step 2: TAM Mapping**
- Industry segmentation with NAICS codes
- Market size per segment, adoption readiness
- Prioritization: Market Size x Solution Fit x Sales Cycle x Deal Value

**Step 3: ICP Modeling**
- 1-3 ICPs with firmographic + psychographic profiles
- Pain-Qualified Segments (PQS): Group by shared pain points
- Personal wins mapped per persona

**Step 4: Account Sourcing**
- Primary data sources ranked by relevance and accuracy
- Keyword lists for About Us filtering
- Signal indicators per segment

**Step 5: Messaging Creation**
- Per ICP: 2 variants (pain-led + social proof/value-led)
- Per variant: initial + 3 follow-ups
- 3 complexity tiers: Simple → Niche-aware → Hyper-specific

---

## Part 14: Operational Benchmarks

### Industry Benchmarks (from Leadbird data at scale)

| Metric | Benchmark | Action Threshold |
|--------|-----------|-----------------|
| Reply rate | 2-5% | < 1% = deliverability issue |
| Interested rate | 0.5-2% of sends | < 0.3% = offer/targeting issue |
| Lead-to-booked | 30-50% | < 30% = follow-up process issue |
| Booked-to-qualified | 50-70% | < 50% = targeting issue |
| Qualified-to-closed | 15-20% | < 15% = sales process issue |
| Time to close | 14-45 days | Nurture sequence must cover this |
| Emails per lead | ~500-1000 | Track and improve quarterly |

### Volume Planning

```
Target leads/month × emails-per-lead = monthly email volume needed
Monthly volume ÷ 25 emails/day ÷ 22 work days = mailboxes needed
Mailboxes ÷ 2 per domain = domains needed
Domains × 2 sets (active + warming) = total domains to maintain
```

### Unit Economics Rule

**LTV ÷ CAC ≥ 3** or it's not worth scaling.

If the math doesn't work, fix:
1. Higher ticket offer
2. Longer customer lifespan
3. Better close rate
4. Cheaper acquisition cost

---

## Part 15: Variable Schema Reference

### Core Variables (always include)
`{{first_name}}`, `{{company_name}}`, `{{role_title}}`, `{{department}}`, `{{company_domain}}`, `{{industry}}`, `{{hq_location}}`

### High-Signal Variables (when available)
`{{tenure_years}}`, `{{recent_post_topic}}`, `{{press_headline}}`, `{{competitor}}`, `{{stack_crm}}`, `{{hiring_roles}}`, `{{traffic_trend}}`

### AI-Generated Variables
`{{ai_customer_type}}`, `{{ai_customer_description}}`, `{{ai_generation}}`, `{{creative_ideas}}`

### Custom Signal Variables (per campaign)
`{{g2_review_complaint}}`, `{{github_repo_found}}`, `{{pricing_page_insight}}`, `{{hiring_spike_dept}}`, `{{negative_review}}`, `{{follower_count}}`

### Case Study Variables
`{{case_study_company}}`, `{{case_study_result}}`, `{{case_study_metric}}`, `{{case_study_timeframe}}`

### Formatting Rules
- Always `{{double_braces}}` in drafts
- Never invent facts — if unknown, omit or use broader strategy
- Variables must be Clay-merge-safe and consistently named

---

## Sources

- **GEX / Eric**: Cold Email v2 Skill System, GEX Swipe File, GTM Strategy Prompts
- **Nick Abraham / Leadbird**: OutboundContent.com (283+ client experience, 22k reply analysis)
- **Fivos Aresti**: Twitter content (4-channel GTM, signal-based outbound, TAM triangulation)
- **GEX GTM Prompts**: Multi-step research pipeline (Deep Research → TAM → ICP → Sourcing → Keywords → Messaging)
