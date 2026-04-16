# API Keys — Documentatie

## TryKitt Email Verification

**Locatie**: `~/.claude/.env` (globaal) + `business-os/.env` (lokaal)
**Key**: `TRYKITT_API_KEY`

### Documentatie
- API Docs: https://documenter.getpostman.com/view/479833/2s93m62NHf
- Rate Limits: 15 concurrent requests per API key

### Gebruik in Edge Functions
```typescript
const TRY_KITT_API_KEY = Deno.env.get('TRYKITT_API_KEY');
```

### Deploy secrets naar Supabase
```bash
npx supabase secrets set TRYKITT_API_KEY="$TRYKITT_API_KEY"
```

## A-Leads (Companies + Contacts)

**Auth**: Cookie-based login via `app.a-leads.co` ONLY. The v1 REST API (`api.a-leads.co/v1`) is **deprecated/broken → 404**. All company and contact sourcing uses cookie-authenticated bulk endpoints.

**Keys**:
- `ALEADS_EMAIL` = sjoerd@vggacquisition.com
- `ALEADS_PASSWORD` = zie `~/.claude/.env`

**Locatie**: `~/.claude/.env` (globaal)

### Confirmed working endpoints

**Companies** — bulk export via `POST /api/tool/bulk/company-search`
- Returns `output_file_name`
- Poll `GET /api/tool/bulk/files` until `status === 'completed'`
- Download `POST /api/tool/bulk/download-file` → signed URL → CSV

**Contacts** — bulk person export via `POST /api/tool/bulk/advanced-search`
- `exportType: "person_search"`
- Same poll/download flow as companies
- Uses identical segment filters (keywords, geo, size)
- `maxPeoplePerCompany: 3` limits contacts per company
- CSV returned contains: first_name, last_name, email, linkedin_url, job_title, company_name, company_domain, etc.

### Login flow (Edge Functions)
```typescript
// POST https://app.a-leads.co/api/auth/login
// Body: { email, password, rememberMe: true }
// Response: set-cookie: access_token=<jwt>
// Gebruik cookie in alle vervolgcalls
const ALEADS_EMAIL = Deno.env.get('ALEADS_EMAIL');
const ALEADS_PASSWORD = Deno.env.get('ALEADS_PASSWORD');
```

### Deploy secrets naar Supabase
```bash
npx supabase secrets set ALEADS_EMAIL="$ALEADS_EMAIL"
npx supabase secrets set ALEADS_PASSWORD="$ALEADS_PASSWORD"
```

### Architecture note
`gtm-aleads-source` performs **both** company and contact sourcing in one call:
1. Bulk `company_search` per ICP segment
2. Upsert companies into `companies` table
3. Bulk `person_search` with the same segment filters
4. Match persons to companies by domain/name
5. Insert into `contacts` + `leads` tables

No separate `find-contacts` call is needed in the automated pipeline.

> **Legacy warning:** The `find-contacts` edge function uses the deprecated v1 REST API (`api.a-leads.co/v1`) which returns 404. It is NOT used in the GTM pipeline. Do not call it in new code — use `gtm-aleads-source` instead.

## OmniVerifier Email Verification [Fase 3]

**Key**: `OMNIVERIFIER_API_KEY`
**Locatie**: `~/.claude/.env`
**Endpoint**: `POST https://api.omniverifier.com/v1/validate`
**Header**: `x-api-key: {key}`

### Deploy secrets naar Supabase
```bash
npx supabase secrets set OMNIVERIFIER_API_KEY="$OMNIVERIFIER_API_KEY"
```

## Overige Keys

| Service | Key Name | Locatie | Status |
|---------|----------|---------|--------|
| Supabase | SUPABASE_SERVICE_ROLE_KEY | Supabase Dashboard | actief |
| Slack | SLACK_BOT_TOKEN | Slack Apps | actief |
| PlusVibe | PLUSVIBE_API_KEY | PlusVibe Settings | LEGACY — gearchiveerd, niet actief |
