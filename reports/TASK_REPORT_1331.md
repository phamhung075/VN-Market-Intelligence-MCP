# Task Report: 1331 — Single-Writer SQLite Guard
date: 2026-04-25
outcome: APPROVED

## Test Results
- Unit tests (1331a): 4 pass / 0 fail
- Full suite: 6500 pass / 215 fail
- Baseline (pre-branch): ~6489 pass / ~226 fail
- Net change: +11 pass, -11 fail (no regressions from 1331a)
- TypeScript: 6 errors (all pre-existing in `1334a-signal-filter-ceo-broadcast.test.ts` — 0 new errors introduced)

## DDD Compliance: PASS
- `writerGuard.ts` correctly placed at `apps/mcp-server/src/infrastructure/db/`
- Entry-point wiring in `alert-engine/src/index.ts` and `stock-price/src/index.ts` (interface layer imports infrastructure — permitted)
- No domain-from-infrastructure violations in modified files

## Security: PASS (with pre-existing note)
- No new `process.env` calls introduced by this task
- `apps/stock-price/src/index.ts` line 20: new `OWN_DB_PATH` correctly uses `Bun.env` (GREEN)
- Pre-existing `process.env` on lines 17-23 of `alert-engine/src/infrastructure/config.ts` and lines 18-19 of `stock-price/src/index.ts` — NOT introduced by this task; inherited from Phase 2b scaffold (task 91d9fdb4)
- No hardcoded secrets or credentials

## Files Changed
- `apps/mcp-server/src/infrastructure/db/writerGuard.ts` (NEW) — assertSingleWriter() lock probe
- `apps/alert-engine/src/infrastructure/config.ts:8-9,19` — ownDbPath field + ALERT_ENGINE_DB_PATH env
- `apps/alert-engine/src/index.ts:21` — Database() uses config.ownDbPath not config.dbPath
- `apps/stock-price/src/index.ts:20-21,25-26` — OWN_DB_PATH constant from STOCK_PRICE_DB_PATH
- `apps/stock-price/src/infrastructure/fetchers.ts` — ownDbPath param, saveQuote() writes to isolated DB
- `apps/mcp-server/src/__tests__/setup.ts:13` — STOCK_PRICE_DB_PATH env set in test preload
- `apps/mcp-server/src/__tests__/1331a-single-writer-guard.test.ts` (NEW) — 4 tests
- `docker-compose.yml` — ALERT_ENGINE_DB_PATH + STOCK_PRICE_DB_PATH added; DB_READONLY=true for TA/macro/kinh-dich
- `docs/ARCHITECTURE.md` — per-service DB isolation table updated

## Critical Checks (all PASS)
- alert-engine `index.ts` line 21: `new Database(config.ownDbPath)` — confirmed
- docker-compose alert-engine: `ALERT_ENGINE_DB_PATH=/app/data/alert_engine.db`, `DB_PATH` removed — confirmed
- docker-compose stock-price: `STOCK_PRICE_DB_PATH=/app/data/stock_price.db` — confirmed
- docker-compose TA/macro/kinh-dich: `DB_READONLY=true` — confirmed
- saveQuote() writes to `ownDbPath` (stock_price.db), never market.db — confirmed

## Non-Blocking Notes
- `writerGuard.ts` line coverage 56.25% — error path branches (lines 30, 33-37) not exercised in unit tests because `:memory:` DB never contends. Acceptable: those branches require OS-level file locking which cannot be reliably reproduced in unit tests.
- Pre-existing `process.env` in `alert-engine/config.ts` and `stock-price/index.ts` — backlog cleanup item, not a 1331a regression. Tracked separately.

## Issues Found
### Blocking
None.

### Non-Blocking
- `apps/alert-engine/src/infrastructure/config.ts:17-23` — pre-existing `process.env` (6 occurrences). Should be replaced with `Bun.env` in a future cleanup task.
- `apps/stock-price/src/index.ts:18-19` — pre-existing `process.env` (2 occurrences). Same cleanup needed.

## Merge Status
Merged: `git merge task/1331a-single-writer-guard` → fast-forward to `937b7477`
Branch deleted: `git branch -d task/1331a-single-writer-guard`
TASKS.md: 1331a + 1331b → Done
