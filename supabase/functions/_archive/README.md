# Archived Edge Functions

These functions are no longer active. Code is kept for reference only — do NOT deploy.

## PlusVibe sync functions — Gearchiveerd 2026-04-09

**Reden:** EmailBison heeft PlusVibe vervangen als sending platform.
`gtm-campaign-push` gebruikt nu de EmailBison API rechtstreeks.
De sync functies zijn overbodig zolang er geen PlusVibe workspace meer actief is.

```
sync-plusvibe-accounts    — Synchroniseerde PlusVibe email accounts naar email_inboxes
sync-plusvibe-campaigns   — Synchroniseerde PlusVibe campaigns naar campaigns tabel
sync-plusvibe-leads       — Synchroniseerde PlusVibe leads/replies naar leads tabel
sync-plusvibe-warmup      — Synchroniseerde PlusVibe warmup scores naar email_inboxes
```

EmailBison sync equivalent: `sync-emailbison-*` functies (te bouwen wanneer nodig).

## Overige gearchiveerde functies

```
aggregate-kpis            — KPI aggregatie (vervangen door sync-plusvibe flow)
analyze-attribution       — Attribution analyse (niet in gebruik)
analyze-icp               — ICP analyse (legacy, vervangen door gtm-synthesis)
check-functions           — Debug helper (niet meer nodig)
detect-anomalies          — Anomalie detectie (niet in gebruik)
gtm-crud-*                — GTM CRUD endpoints (vervangen door orchestrator CLI)
lead-router               — Lead routing (vervangen door leads tabel direct)
setup-cron-jobs           — Eenmalig setup script (gedaan)
webhook-calendar          — Oud calendar webhook (vervangen door webhook-meeting)
webhook-debug             — Debug endpoint (niet meer nodig)
```
