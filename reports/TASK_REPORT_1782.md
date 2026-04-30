# Task Report: 1782 — BCTC Enricher Q1-2026
date: 2026-04-30
outcome: APPROVED

## Summary

Root cause: `detectTargetQuarter()` returns Q4-2025 for months 1–4, so no Q1-2026
rows were ever seeded until May 1. Additionally, the enricher left no-URL rows
perpetually pending instead of incrementing attempts and parking them after
MAX_ENRICH_ATTEMPTS=5.

## Fixes Verified

1. `backfillBctcQ1_2026(db)` — idempotent seeder in `seedWatchlist.ts`, uses
   `INSERT OR IGNORE` against the `UNIQUE(action_code, period_year, period_quarter)`
   constraint. Skips tickers that already have a `financial_reports` row for Q1-2026.
2. `schema.ts` — imports and calls `backfillBctcQ1_2026(db)` inside the
   `!isTestEnv` block in `initDatabase()` (line 201), alongside the existing
   `backfillBctcQ4` call.
3. `bctcQueueEnricherJob.ts` — adds `MAX_ENRICH_ATTEMPTS = 5`. On every no-URL
   run: increments `attempts`. When `attempts >= MAX_ENRICH_ATTEMPTS`: sets
   `status = 'url_not_found'` and increments attempts atomically. Below threshold:
   stays pending with incremented count.

## Test Results

- Task tests (`1782-bctc-q1-2026-seeding.test.ts`): 11 pass / 0 fail
- Full suite: 8294 pass / 24 fail
- Baseline (pre-branch): 8284 pass / 24 fail
- Delta: +10 pass, 0 new failures (1 test file = 11 tests; 1 test counted in
  suite before this run via pre-existing import)
- All 24 failures are pre-existing (Task 089 macro snapshot, Task 1382d signal
  outcome, 1349c scheduler docs, 1300a memory tools, 1303h extractor guard)
- TypeScript: 0 errors (`bun tsc --noEmit`)

## DDD Compliance: PASS

- `domain/services/bctcDiscovery.ts` — zero infrastructure imports
- `infrastructure/db/seedWatchlist.ts` — correctly placed in infrastructure layer
- `scheduler/financial-reports/bctcQueueEnricherJob.ts` — scheduler layer, imports
  from domain and infrastructure only (no business logic leakage)

## Security: PASS

- No `process.env` usage (Bun.env only)
- No hardcoded credentials
- All SQL uses parameterized queries (prepared statements)
- No `any` types introduced

## Issues Found

### Blocking
None.

### Non-Blocking
None.

## Merge Status

Merged to `main` via `--no-ff` on 2026-04-30. Branch `task/1782-bctc-enricher-q1-2026` deleted.
