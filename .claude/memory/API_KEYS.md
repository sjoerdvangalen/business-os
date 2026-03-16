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
npx supabase secrets set TRYKITT_API_KEY=VMOnRBKsLQK2WmCu9ms7TqdeAjciQd
```

## Overige Keys

| Service | Key Name | Locatie |
|---------|----------|---------|
| Supabase | SUPABASE_SERVICE_ROLE_KEY | Supabase Dashboard |
| PlusVibe | PLUSVIBE_API_KEY | PlusVibe Settings |
| Slack | SLACK_BOT_TOKEN | Slack Apps |
