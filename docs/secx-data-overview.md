# SentioCX (SECX) — Data Overview

> Updated: 2026-04-23
> Context: Question about SECX data status and 5000+ records

## Status

SECX is the most researched client in the codebase but has **zero live operational data** in the database. All work has been offline prompt engineering and messaging generation.

## Live Database Status

| Table         | SECX Records | Source                          |
|---------------|-------------|----------------------------------|
| `clients`     | 1           | Onboarding completed 2026-03-23  |
| `gtm_strategies` | 0        | Not created yet (`null` in orchestration) |
| `campaign_cells`| 0         | None seeded                      |
| `companies`   | 0           | Not imported                     |
| `contacts`    | 0           | Not imported                     |
| `leads`       | 0           | Not imported                     |
| `campaigns`   | 0           | No EmailBison campaigns          |

Pipeline status: stuck at `solution_mapping` phase. Gate 1 and Gate 2 both `pending`.

## Offline Data Assets (Filesystem)

### CSV Files (`scripts/output/`)

| File                                      | Records | Size | Description                           |
|-------------------------------------------|---------|------|---------------------------------------|
| `secx-messaging-full-2026-04-20.csv`      | 43,314  | 10 MB | Full personalized messaging dataset   |
| `secx-messaging-csv-2026-04-20.csv`       | 17,187  | 2.3 MB| Messaging subset                      |
| `secx-messaging-csv-2026-04-20.jsonl`     | —       | 2.7 MB| JSONL variant                         |
| `secx-test-all-v3-2026-04-22.csv`         | ~2,300  | 323 KB| Test batch all personas               |
| `secx-test-all-v3-2026-04-23.csv`         | ~300    | 41 KB | Latest test batch (all personas)      |
| `secx-test-ops-v3-2026-04-22.csv`         | ~200    | 20 KB | OPS persona test                      |

### CSV Schema (`secx-messaging-full`)

Columns: First Name, Last Name, Work Email, Job Title, Company, Personal LinkedIn, Company LinkedIn, Industries, # Employees, Company Keywords, Industry, Persona, Website, Company Summary, Bullets

Example:
- Travis O'rourke, travis.orourke@hays.com, CCO Americas, Hays
- LinkedIn: linkedin.com/in/travisorourke
- Personalized bullets + company summary generated via GPT-5.4-nano

### Research Files (`research/`)

18 files including:
- `SECX-campaigns.md` — 24-cell campaign matrix (4 personas x 6 verticals)
- `SECX-test-vergelijking.md` — HUIDIG vs ERIC A/B test comparison
- `SECX-prompt-HUIDIG-CX-v5.md` — PRODUCTION READY prompt (score 8.2/10, 30 companies)
- 8 prompt variants tracked (HUIDIG + ERIC styles x 4 personas)

### Scripts (`scripts/`)

15+ SECX-specific scripts:
- `secx-pipeline-orchestrator.ts` — Full 3-phase pipeline
- `secx-test-all-v3.ts` — Test harness for all 4 personas
- `secx-validator.ts` — Bullet validation with retry
- `run-waterfall-sentio.ts` — Batch email waterfall for 607 contacts
- Various spot-check, enrichment, and validation scripts

### Prompts (`scripts/secx-prompts/`)

4 persona prompts: CX, OPS, TECH, CSUITE

## Test Results

| Persona      | Status              | Score | Tested On |
|--------------|---------------------|-------|-----------|
| CX Leadership| PRODUCTION READY    | 8.2/10| 30 companies |
| OPS          | ready_for_testing   | —     | Grammar defined |
| TECH         | ready_for_testing   | —     | Grammar defined |
| CSUITE       | ready_for_testing   | —     | Grammar defined |

Scorer v3 achieved 99.88% perfect 10/10 scores on 5,729 record batch.

## Key Registries Derived from SECX

The following shared files in the codebase are derived from SECX benchmark data:
- `services/batch-worker/jobs/shared/persona_registry.ts`
- `services/batch-worker/jobs/shared/vertical_registry.ts`
- `supabase/functions/_shared/formula_resolver.ts`

## What's Missing to Go Live

1. **gtm-research** — Exa deep research (→ creates `gtm_strategies` row)
2. **gtm-synthesis** — OpenAI strategy synthesis
3. **gtm-campaign-cell-seed** — Create 24 cells from matrix
4. **gtm-execution-review-doc** — Keyword profiles + A-Leads preview
5. **gtm-aleads-source** — Bulk sourcing per ICP segment
6. **gtm-messaging-doc** — Per-cell ERIC + HUIDIG messaging
7. **gtm-campaign-cell-enrich** — Write messaging back to cells
8. **Import 43k CSV records** into `companies`/`contacts` tables
9. **EmailBison campaign creation** — Push to live campaigns

## Cost Benchmark

- ~EUR 0.00034 per record (GPT-5.4-nano bullet generation)
- Total for 43k records: ~EUR 15
- vs Clay: EUR 50+ per 1000 leads
