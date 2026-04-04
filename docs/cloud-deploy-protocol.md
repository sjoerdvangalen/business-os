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
| `sync-plusvibe-campaigns` | */15 min | Manual trigger check sync_log |
| `sync-plusvibe-accounts` | */15 min | Manual trigger check sync_log |
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

## Emergency Contacts

- Supabase Status: https://status.supabase.com/
- Dashboard: https://supabase.com/dashboard/project/gjhbbyodrbuabfzafzry

---

## Pending Migration: Email Inboxes - External ID Consolidatie

### Huidige situatie
- `plusvibe_id` TEXT - PlusVibe inbox ID
- `emailbison_id` TEXT - EmailBison inbox ID

### Gewenste situatie
- `provider_inbox_id` TEXT - External inbox ID (provider-agnostisch)
- `provider` TEXT - 'plusvibe' | 'emailbison'

### Migratie strategie
```sql
-- 1. Nieuwe kolom toevoegen
ALTER TABLE email_inboxes ADD COLUMN IF NOT EXISTS provider_inbox_id TEXT;

-- 2. Data migreren
UPDATE email_inboxes SET provider_inbox_id = plusvibe_id WHERE provider = 'plusvibe' AND plusvibe_id IS NOT NULL;
UPDATE email_inboxes SET provider_inbox_id = emailbison_id WHERE provider = 'emailbison' AND emailbison_id IS NOT NULL;

-- 3. Index aanpassen
CREATE INDEX idx_email_inboxes_provider_inbox ON email_inboxes(provider, provider_inbox_id);
DROP INDEX IF EXISTS idx_email_inboxes_plusvibe;
DROP INDEX IF EXISTS idx_email_inboxes_emailbison_id;

-- 4. Oude kolommen verwijderen
ALTER TABLE email_inboxes DROP COLUMN IF EXISTS plusvibe_id;
ALTER TABLE email_inboxes DROP COLUMN IF EXISTS emailbison_id;
```

### Functies aanpassen na migratie
- `sync-plusvibe-accounts` - `plusvibe_id` → `provider_inbox_id`
- `sync-emailbison-accounts` - `emailbison_id` → `provider_inbox_id`
- `webhook-receiver` - inbox lookup via `provider_inbox_id`
- `webhook-emailbison` - inbox lookup via `provider_inbox_id`
