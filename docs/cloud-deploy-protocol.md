# Cloud Deploy Protocol — business-os

> Procedure voor het doorvoeren van database migraties en edge functions naar Supabase, met validatie dat het zowel in SQL als in de interface zichtbaar is.

## Core Principe

**"Deploy naar Supabase" betekent altijd 3 dingen:**
1. Migratie succesvol uitgevoerd (SQL)
2. Zichtbaar in Supabase Dashboard (interface)
3. Edge Functions gedeployed (indien van toepassing)

---

## Standaard Deploy Flow

### 1. Database Migraties

```bash
# 1. Lokale migratie maken
# (bestand: supabase/migrations/YYYYMMDDNNNNNN_beschrijving.sql)

# 2. Push naar Supabase
npx supabase db push

# 3. VALIDATIE — Check in SQL
npx supabase psql --command "\d table_name"
npx supabase psql --command "SELECT column_name FROM information_schema.columns WHERE table_name = 'table_name';"

# 4. VALIDATIE — Check in Dashboard (handmatig)
# → Supabase Dashboard → Table Editor → table_name
# → Verify: kolommen bestaan, types kloppen, constraints actief
```

### 2. Edge Functions

```bash
# Deploy specifieke functie(s)
npx supabase functions deploy function-name --no-verify-jwt

# Of meerdere tegelijk
npx supabase functions deploy func1 func2 func3 --no-verify-jwt

# VALIDATIE — Test direct
curl -X POST "https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/function-name" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 3. Secrets (indien nodig)

```bash
# Set secret
npx supabase secrets set KEY_NAME="value"

# Verify
npx supabase secrets list
```

---

## Validatie Checklist

### Na elke migratie:

- [ ] SQL output toont verwachte structuur
- [ ] Dashboard Table Editor toont nieuwe kolommen
- [ ] Indexes/constraints zichtbaar in Database → Indexes
- [ ] RLS policies correct (indien gewijzigd)

### Na edge function deploy:

- [ ] Function zichtbaar in Dashboard → Edge Functions
- [ ] Test call geeft succes response
- [ ] Logs tonen verwachte output (Dashboard → Logs)

---

## Gotchas & Fixes

### Composite UNIQUE Constraints + Upsert

**Probleem:** `onConflict: 'col1'` werkt niet bij `UNIQUE(col1, col2)`

**Oplossing:** Specificeer alle kolommen:
```typescript
// FOUT
.upsert(data, { onConflict: 'provider_inbox_id' })

// CORRECT
.upsert(data, { onConflict: 'provider,provider_inbox_id' })
```

### Migratie is gepusht maar niet zichtbaar

**Cause:** Supabase cachet soms de schema weergave.

**Fix:**
1. Dashboard refreshen (F5)
2. Of: SQL Editor → `SELECT pg_reload_conf();`
3. Of: Wacht 30-60 seconden

### Foreign Key Constraints

Bij het toevoegen van FK constraints:
```sql
-- Check eerst of data voldoet
SELECT * FROM table WHERE foreign_key_col NOT IN (SELECT id FROM other_table);

-- Dan pas constraint toevoegen
ALTER TABLE table ADD CONSTRAINT fk_name FOREIGN KEY (col) REFERENCES other_table(id);
```

---

## Rollback Procedure

### Migratie terugdraaien:

```bash
# Lokale shadow DB reset (alle migraties opnieuw)
npx supabase db reset

# Of: handmatige downgrade migratie maken
# (nieuw bestand met tegengestelde operaties)
```

### Edge Function rollback:

```bash
# Vorige versie herstellen via git
git checkout HEAD~1 -- supabase/functions/function-name/
npx supabase functions deploy function-name --no-verify-jwt
```

---

## Project Specifiek

**Project:** `gjhbbyodrbuabfzafzry`
**Region:** West EU (Ireland)
**Stack:** Supabase + Deno Edge Functions

### Belangrijke Tabellen

| Tabel | Check Na Migratie |
|-------|-------------------|
| `campaigns` | `provider`, `provider_campaign_id` |
| `email_inboxes` | `provider`, `provider_inbox_id` |
| `email_threads` | `provider`, `provider_*_id` kolommen |
| `contacts` | `company_id` FK, `contact_status` |
| `sync_log` | Records worden hier gelogd |

### Sync Functions

| Function | Cron | Validatie Test |
|----------|------|----------------|
| `sync-emailbison-campaigns` | */15 min | Manual trigger check sync_log |
| `sync-emailbison-accounts` | */15 min | Manual trigger check sync_log |

### Validatie Queries

```sql
-- Check campaigns per provider
SELECT provider, COUNT(*) FROM campaigns GROUP BY provider;

-- Check inboxes per provider
SELECT provider, COUNT(*) FROM email_inboxes GROUP BY provider;

-- Check recent syncs
SELECT source, table_name, operation, records_updated, records_failed, created_at
FROM sync_log
ORDER BY created_at DESC
LIMIT 10;
```

---

## GTM Pipeline V2 — Validatie per fase

Na het deployen of wijzigen van GTM-functies: valideer de live staat per pipeline fase.

### Fase 1 — Synthesis

Na deploy van `gtm-synthesis`:
```sql
-- Strategie aangemaakt voor client
SELECT id, client_id, status, created_at
FROM gtm_strategies
WHERE client_id = '<uuid>'
ORDER BY created_at DESC LIMIT 3;

-- Synthesis bevat verwachte sleutels
SELECT synthesis->>'solutions' IS NOT NULL,
       synthesis->>'icp_segments' IS NOT NULL,
       synthesis->>'campaign_matrix_seed' IS NOT NULL
FROM gtm_strategies WHERE id = '<strategy_uuid>';
```

### Fase 2 — Skeleton cells (na external_approve)

Na deploy van `gtm-campaign-cell-seed`:
```sql
-- Cells aangemaakt met juiste identiteit
SELECT cell_code, solution_key, icp_key, vertical_key, persona_key, status
FROM campaign_cells
WHERE strategy_id = '<strategy_uuid>'
ORDER BY created_at;

-- Status moet sourcing_pending zijn
SELECT status, COUNT(*) FROM campaign_cells
WHERE strategy_id = '<strategy_uuid>' GROUP BY status;
```

### Fase 3 — Sourcing (na sourcing_approve)

Na deploy van `gtm-aleads-source`:
```sql
-- Sourcing run aangemaakt
SELECT id, client_id, status, companies_found, contacts_found, created_at
FROM sourcing_runs
WHERE client_id = '<uuid>'
ORDER BY created_at DESC LIMIT 5;

-- Contacts gelinkt aan cells via leads
SELECT cell_id, COUNT(*) as contact_count
FROM leads
WHERE client_id = '<uuid>'
GROUP BY cell_id;
```

### Fase 4 — Messaging (na messaging_approve)

Na deploy van `gtm-campaign-cell-enrich`:
```sql
-- Cells hebben brief met hook_frameworks en top-level variant kolommen
SELECT cell_code, status, cta_variant,
       brief->'hook_frameworks' IS NOT NULL as has_hooks
FROM campaign_cells
WHERE strategy_id = '<strategy_uuid>';

-- Status moet ready zijn
SELECT status, COUNT(*) FROM campaign_cells
WHERE strategy_id = '<strategy_uuid>' GROUP BY status;
```

### Fase 5 — Campaign push (na checkLiveTestReadiness)

Na deploy van `gtm-campaign-push`:
```sql
-- EmailBison campaigns aangemaakt en gelinkt aan cells
SELECT c.name, c.provider_campaign_id, c.cell_id, c.status
FROM campaigns c
WHERE c.client_id = '<uuid>'
ORDER BY c.created_at DESC LIMIT 10;
```

---

## GTM Pipeline V2 Deploy Validation

Run after every migration or edge function deploy that touches the GTM pipeline.

### Schema check

```bash
source ~/.claude/scripts/load-env.sh

# campaign_cells new columns
curl -s -X POST "https://api.supabase.com/v1/projects/gjhbbyodrbuabfzafzry/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT column_name FROM information_schema.columns WHERE table_name='\''campaign_cells'\'' AND column_name IN ('\''campaign_archetype'\'','\''signal_tier'\'','\''hook_variant'\'','\''offer_variant'\'','\''cta_variant'\'');"}'

# contacts.enriched_at
curl -s -X POST "https://api.supabase.com/v1/projects/gjhbbyodrbuabfzafzry/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT column_name FROM information_schema.columns WHERE table_name='\''contacts'\'' AND column_name='\''enriched_at'\'';"}'
```

### Terminology drift check

```bash
grep -RniE "send_mode|cta_direction|whole[-_ ]offer|campaign_family|signal_tier_default|offer_mode|data_led|matrix_solution" \
  CLAUDE.md ROADMAP.md docs/
# Expected: 0 matches (or only in archived/deprecated context)
```

### GTM Pipeline V2 gate checklist

- [ ] CLAUDE.md tabellijst matcht live DB
- [ ] campaign_cells seed werkt: campaign_archetype=matrix_driven, signal_tier=3 (baseline)
- [ ] hook_variant / offer_variant / cta_variant kolommen bestaan
- [ ] messaging_revision is toegestaan als cell status
- [ ] Geen writes naar `clients.gtm_synthesis` (DEPRECATED_READONLY)
- [ ] gtm-messaging-doc schrijft NIET naar campaign_cells execution state
- [ ] gtm-campaign-cell-enrich schrijft pas na messaging_approve
- [ ] SECX dry-run gate na Sprint 2: formula resolver actief, banned adjectives absent, persona verbs correct

---

## Emergency Contacts

- Supabase Status: https://status.supabase.com/
- Dashboard: https://supabase.com/dashboard/project/gjhbbyodrbuabfzafzry

