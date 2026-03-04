# Business OS — Data Architecture

> The 3 Pillars: **Data Ingestion → Data Insight → Data-Driven Actions**

---

## Current Problem (why dashboards fail)

**Huidige model is contact-centric.** Threads hebben geen entity, ze zijn slechts `thread_id` strings.

```
Problem:
- Email reaction comes in → email_messages.direction = "inbound"
- Thread ID stored as TEXT (not FK) → no real relationship
- Contact linked to message
- But: same account with 2 contacts → 2 threads → fragmented view
- Dashboard can't answer: "What's the conversation status with CompanyX?"

Result: You must manually track account-level engagement.
```

---

## Proposed Model (Account-Centric)

### Core Entities & Relationships

```
CLIENT
  ├─ CAMPAIGN (cold email campaign per client)
  ├─ EMAIL_ACCOUNT (sending mailbox)
  ├─ DOMAIN (domain sending from)
  └─ ACCOUNT (bedrijf/company)
        ├─ CONTACT (person at account)
        │     ├─ EMAIL_THREAD (conversation with contact)
        │     │     └─ EMAIL_MESSAGE (individual email in thread)
        │     └─ MEETING (booked via thread)
        ├─ OPPORTUNITY (CRM stage for account)
        └─ ACCOUNT_ENGAGEMENT (aggregated metrics per account)
```

### Table Structure (Proposed Changes)

#### 1. ACCOUNTS (already exists, but needs refresh)
```sql
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),

  -- Identity
  name TEXT NOT NULL,
  domain TEXT NOT NULL,  -- company.com
  industry TEXT,
  company_size TEXT,     -- 1-10, 10-50, 50-200, etc.

  -- Engagement State
  status TEXT DEFAULT 'new',  -- new, contacted, engaged, converted, lost
  lead_quality INT DEFAULT 0, -- 0-100 (based on engagement)

  -- Aggregated Metrics
  total_contacts INT DEFAULT 0,
  active_contacts INT DEFAULT 0,
  thread_count INT DEFAULT 0,
  message_count INT DEFAULT 0,
  reply_count INT DEFAULT 0,
  positive_reply_count INT DEFAULT 0,

  -- Last Activity
  first_contact_at TIMESTAMPTZ,
  last_contact_at TIMESTAMPTZ,
  last_reply_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### 2. CONTACTS (keep most, add clarity)
```sql
-- Existing columns fine:
-- id, client_id, account_id, email, full_name, first_name, last_name,
-- linkedin_url, phone, position, department, industry

-- Already added in schema:
-- campaign_id, company_website, city, state, country, label, lead_source

-- Keep these:
-- opened_count, replied_count, bounced, bounce_message, lead_score

-- Add:
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS account_id UUID NOT NULL REFERENCES accounts(id);
-- (contact MUST belong to account — this is the key constraint)
```

#### 3. EMAIL_THREADS (NEW — this is the key addition)
```sql
CREATE TABLE IF NOT EXISTS email_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  contact_id UUID NOT NULL REFERENCES contacts(id),
  account_id UUID NOT NULL REFERENCES accounts(id),
  campaign_id UUID REFERENCES campaigns(id),

  -- Thread Identity (from PlusVibe)
  plusvibe_thread_id TEXT UNIQUE NOT NULL,
  subject TEXT,

  -- Engagement Metrics (on this specific thread)
  message_count INT DEFAULT 0,
  outbound_count INT DEFAULT 0,      -- how many we sent
  inbound_count INT DEFAULT 0,        -- how many they replied
  positive_reply BOOLEAN DEFAULT FALSE,
  reply_sentiment TEXT,               -- 'positive', 'neutral', 'negative', 'ooo'

  -- Status (on this thread)
  thread_status TEXT DEFAULT 'open',  -- open, closed, converted, bounced
  last_message_direction TEXT,        -- 'outbound', 'inbound'

  -- Timestamps
  first_message_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  reply_at TIMESTAMPTZ,               -- when first reply came
  reply_days INT,                     -- days to first reply (calculated)

  -- Links
  meeting_id UUID REFERENCES meetings(id),  -- if thread resulted in meeting
  opportunity_id UUID REFERENCES opportunities(id),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(client_id, plusvibe_thread_id)
);
```

**Why this matters:**
- Threads are now first-class entities
- Can query: "All threads for account X" → understand full conversation
- Can query: "Positive replies" → understand what worked
- Can query: "Reply time distribution" → understand responsiveness
- Metrics rollup to ACCOUNT level

#### 4. EMAIL_MESSAGES (keep, add clarity)
```sql
-- Keep existing:
-- id, plusvibe_id, contact_id, campaign_id, direction,
-- from_email, to_email, subject, body_text, body_html,
-- content_preview, label, bounce_info, opened_at, opened_count

-- Add:
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS thread_id UUID NOT NULL REFERENCES email_threads(id);
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS account_id UUID NOT NULL REFERENCES accounts(id);
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS sentiment TEXT;  -- 'positive', 'neutral', 'negative', 'ooo', NULL
-- (sentiment on inbound only)

-- Remove/Deprecate:
-- thread_id TEXT (old string reference) — migrate to proper FK
```

#### 5. ACCOUNT_ENGAGEMENT (NEW — aggregated metrics)
```sql
CREATE TABLE IF NOT EXISTS account_engagement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  date DATE NOT NULL,

  -- Daily Metrics
  emails_sent INT DEFAULT 0,
  emails_replied INT DEFAULT 0,
  positive_replies INT DEFAULT 0,
  reply_rate DECIMAL(5,2),

  -- Cumulative (all-time for this account)
  cumulative_emails INT DEFAULT 0,
  cumulative_replies INT DEFAULT 0,
  cumulative_positive INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(account_id, date)
);
```
**Populated by**: `sync-plusvibe-leads` after each webhook → aggregates all threads.

#### 6. DAILY_KPIs (Enhance with Account dimension)
```sql
-- Keep:
-- client_id, date, emails_sent, replies, etc.

-- Add:
ALTER TABLE daily_kpis ADD COLUMN IF NOT EXISTS accounts_contacted INT DEFAULT 0;
ALTER TABLE daily_kpis ADD COLUMN IF NOT EXISTS accounts_with_positive INT DEFAULT 0;
ALTER TABLE daily_kpis ADD COLUMN IF NOT EXISTS new_accounts INT DEFAULT 0;
-- (distinct account_ids touched this day)
```

---

## Data Flow (Ingestion → Insight → Action)

### Pillar 1: Data Ingestion

#### Webhook Event (PlusVibe sends email reply)
```
PlusVibe Webhook
  → webhook-receiver
    → Insert into email_messages:
       - direction = "inbound"
       - contact_id = X
       - sentiment = classify_reply(body)
       - account_id = contacts[contact_id].account_id
       - thread_id = email_threads[plusvibe_thread_id]
    → Update email_threads:
       - inbound_count += 1
       - positive_reply = (sentiment == "positive")
       - reply_at = NOW()
       - reply_days = (reply_at - first_message_at).days
       - thread_status = "converted" (if positive)
    → Update account:
       - last_reply_at = NOW()
       - positive_reply_count += 1 (if positive)
       - status = "engaged" (if first positive reply)
    → reply-classifier
       → lead-router (send to appropriate destination)
    → Insert/Update account_engagement
       - daily record: emails_replied += 1, etc.
```

#### Campaign Send (we send email)
```
PlusVibe Sync (via sync-plusvibe-leads)
  → For each lead contacted this period:
    → Check if email_thread exists (by plusvibe_thread_id)
    → If not: create email_thread
       - contact_id = X
       - account_id = contacts[contact_id].account_id
       - campaign_id = X
       - thread_status = "open"
    → If exists: update email_thread
       - message_count += 1
       - outbound_count += 1
    → Create email_message
       - direction = "outbound"
       - thread_id = email_threads[id]
       - account_id = email_threads.account_id
    → Update account:
       - total_contacts = COUNT(DISTINCT contact_id)
       - thread_count = COUNT(DISTINCT thread_id)
       - last_contact_at = NOW()
       - status = "contacted" (if first contact)
    → Update account_engagement
       - daily record: emails_sent += 1
```

### Pillar 2: Data Insight (Dashboards)

#### Account Health Dashboard
```
SELECT
  a.name,
  a.status,
  COUNT(DISTINCT c.id) as contacts,
  COUNT(DISTINCT t.id) as threads,
  SUM(t.inbound_count) as total_replies,
  SUM(CASE WHEN t.positive_reply THEN 1 ELSE 0 END) as positive_threads,
  ROUND(SUM(CASE WHEN t.positive_reply THEN 1 ELSE 0 END)::numeric /
        NULLIF(COUNT(DISTINCT t.id), 0) * 100, 2) as positive_rate,
  MAX(COALESCE(t.reply_at, a.last_contact_at)) as last_activity,
  ROUND(AVG(CASE WHEN t.reply_days > 0 THEN t.reply_days END), 1) as avg_reply_days
FROM accounts a
LEFT JOIN contacts c ON a.id = c.account_id
LEFT JOIN email_threads t ON a.id = t.account_id
WHERE a.client_id = $1
GROUP BY a.id
ORDER BY a.last_reply_at DESC NULLS LAST;
```

**Output**: "Company X — 3 threads, 2 positive, 15 days avg reply time"

#### Thread-Level Dashboard
```
SELECT
  t.subject,
  c.full_name,
  a.name as company,
  t.message_count,
  t.positive_reply,
  t.reply_at - t.first_message_at as time_to_reply,
  t.thread_status,
  em_last.body_text as last_message_preview
FROM email_threads t
JOIN contacts c ON t.contact_id = c.id
JOIN accounts a ON t.account_id = a.id
LEFT JOIN email_messages em_last ON t.id = em_last.thread_id
  AND em_last.direction = 'inbound'
  AND em_last.created_at = (
    SELECT MAX(created_at) FROM email_messages
    WHERE thread_id = t.id AND direction = 'inbound'
  )
WHERE t.account_id = $1
ORDER BY t.last_message_at DESC;
```

**Output**: Per-account view of all conversations, with sentiment + reply time.

#### Campaign Performance (Account-Level)
```
SELECT
  cm.name as campaign,
  COUNT(DISTINCT t.account_id) as accounts_touched,
  COUNT(DISTINCT t.id) as threads_created,
  SUM(CASE WHEN t.positive_reply THEN 1 ELSE 0 END) as positive_conversations,
  ROUND(SUM(CASE WHEN t.positive_reply THEN 1 ELSE 0 END)::numeric /
        NULLIF(COUNT(DISTINCT t.id), 0) * 100, 2) as conversation_positive_rate,
  SUM(t.message_count) as total_messages,
  ROUND(AVG(CASE WHEN t.reply_days > 0 THEN t.reply_days END), 1) as avg_days_to_reply
FROM campaigns cm
LEFT JOIN email_threads t ON cm.id = t.campaign_id
WHERE cm.client_id = $1
GROUP BY cm.id
ORDER BY cm.created_at DESC;
```

**Output**: Per-campaign: how many accounts engaged? What % positive? How fast?

### Pillar 3: Data-Driven Actions

#### Decision: Pause Campaign if Account-Level Reply Rate Too Low
```
SELECT cm.id, cm.name, COUNT(*) as accounts_with_0_replies
FROM campaigns cm
LEFT JOIN email_threads t ON cm.id = t.campaign_id
WHERE t.message_count >= 5        -- at least 5 emails sent
  AND t.inbound_count = 0          -- zero replies
GROUP BY cm.id
HAVING COUNT(*) > (
  -- if >40% of accounts have 0 replies after 5+ emails
  SELECT COUNT(DISTINCT account_id) * 0.4
  FROM email_threads
  WHERE campaign_id = cm.id
);
```
**Action**: Alert → "Campaign X: 40%+ of accounts unresponsive after 5+ emails. Pause variant or check copy."

#### Decision: Identify Top-Performing Angles
```
SELECT
  t.subject,  -- or campaign variant tag if added
  COUNT(*) as times_used,
  SUM(CASE WHEN t.positive_reply THEN 1 ELSE 0 END) as positive_count,
  ROUND(SUM(CASE WHEN t.positive_reply THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 2) as positive_rate
FROM email_threads t
WHERE t.campaign_id = $1
  AND t.created_at > NOW() - INTERVAL '30 days'
GROUP BY t.subject
HAVING COUNT(*) >= 10  -- statistically significant
ORDER BY positive_rate DESC;
```
**Action**: "Angle X (subject line Y) converts at 8% positive. Angle Z at 2%. Expand X, pause Z."

#### Decision: Account Engagement Scoring
```
UPDATE accounts SET
  lead_quality = (
    -- engagement score: replies, positive sentiment, speed
    LEAST(100, GREATEST(0,
      (positive_reply_count * 25) +           -- 0-25 pts per positive
      (reply_count * 5) +                      -- 0-5 pts per reply
      (CASE WHEN reply_days < 3 THEN 25 ELSE
              WHEN reply_days < 7 THEN 15 ELSE 5 END) +  -- speed bonus
      (CASE WHEN status = 'converted' THEN 20 ELSE 0 END)  -- conversion bonus
    ))
  ),
  status = CASE
    WHEN positive_reply_count >= 2 THEN 'hot'
    WHEN reply_count >= 1 THEN 'engaged'
    WHEN message_count >= 3 THEN 'contacted'
    ELSE 'new'
  END
WHERE client_id = $1;
```
**Action**: Automatically rank accounts → "Top 10 accounts to close this week."

---

## Implementation Priority

### Phase 0 (Week 1) — Foundation
- [ ] Create `accounts` table (with client_id constraint)
- [ ] Create `email_threads` table with all FKs
- [ ] Add `account_id` FK to `contacts` (make NOT NULL)
- [ ] Migrate `email_messages.thread_id` from TEXT → UUID FK
- [ ] Create `account_engagement` table

### Phase 1 (Week 2) — Syncs
- [ ] Update `webhook-receiver`: write to `email_threads` on first reply
- [ ] Update `sync-plusvibe-leads`: create/update `email_threads` on each sync
- [ ] Update aggregation: `account` stats rollup
- [ ] Update `daily_kpis`: add account-level fields

### Phase 2 (Week 3) — Insight (Dashboards)
- [ ] Account health dashboard SQL
- [ ] Thread-level dashboard SQL
- [ ] Campaign performance (account view) SQL
- [ ] Slack alert: daily account summary

### Phase 3 (Week 4) — Actions
- [ ] Campaign optimization agent: uses account-level metrics
- [ ] Lead scoring: automatic account ranking
- [ ] Pause suggestions: account-level reply rate analysis

---

## Key Constraints & Rules

1. **Every contact MUST have an account** (NOT NULL account_id)
2. **Every thread MUST have an account** (FK to account)
3. **Every message MUST have an account** (FK to account, for fast queries)
4. **Account metrics auto-aggregate** (via DB triggers or sync functions)
5. **Thread status = source of truth** (not contact status)
6. **Sentiment on inbound only** (reply classification)

---

## Benefits (Why This Matters)

| Before | After |
|--------|-------|
| "I need to check each contact manually" | "I see the account engagement score immediately" |
| "Did company X respond?" (hard to find) | "Company X: 3 positive threads, last reply 2 days ago" |
| "Which variant won?" (via contacts, scattered) | "Variant A: 8% positive rate. Variant B: 2%. Expand A." |
| "Is domain burnt?" (guessing via bounce rates) | "Variant X with this account group: 0% replies. Flag for review." |
| Email replies disappear after classification | "All threads stay as history, indexed by account & contact" |

---

## Migration Path

This requires data migration but **not** a breaking change:

1. Backfill `accounts` table from existing `contacts.company` + domain
2. Backfill `contacts.account_id` from step 1
3. Create `email_threads` from existing `email_messages.thread_id` groups
4. Add `thread_id` FK + `account_id` to `email_messages` (not yet NOT NULL)
5. Backfill `email_messages` for all historical messages
6. Once verified: make NOT NULL
7. Update all syncs to use new model
8. Old `thread_id TEXT` column can remain for migration safety, then drop

---

## Summary

This is **account-centric data modeling** instead of contact-centric.

**The 3 Pillars now work:**
1. **Ingestion**: Threads capture full conversation history per contact + account
2. **Insight**: Dashboards show account engagement, sentiment, reply times
3. **Action**: Algorithms optimize campaigns based on account-level metrics

Your dashboards can now answer: "How are we doing with CompanyX across all contacts?" and "Which emails are actually converting?" without manual data hunting.
