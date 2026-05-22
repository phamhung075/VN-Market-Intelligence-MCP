## §1-spec

# TASK_1970 — TA OHLCV Backfill: RSI/MACD/BB Indicator Restoration

**Status:** IMPL_DONE  
**Zone:** `apps/mcp-server/`  
**Owner:** dev-mcp-server  
**Priority:** HIGH — TA-driven alert restoration depends on this

### Context

After the 1972 VNDIRECT null-coercion fix (commit `0a51a5a0`), ~1072 rows with `low=0` remain in `daily_ohlcv` from earlier fetches. The existing `ohlcvBackfill.ts` uses `INSERT OR IGNORE`, so it will never overwrite these corrupt rows.

Additionally, tickers need >= 35 OHLCV rows for RSI(14)/MACD(12,26,9)/BB(20) to compute (MACD needs slow+signal-1 = 34 minimum; 35 is the safe buffer). Tickers below this threshold produce null TA indicators, silencing `taAlertScan`.

### Acceptance Criteria

- AC-1: Tickers with >= TA_MIN_ROWS (35) clean rows (no low=0) → skipped (covered)
- AC-2: Tickers with < TA_MIN_ROWS rows → fetched via VNDIRECT, upserted via INSERT OR REPLACE
- AC-3: Tickers with any low=0 corrupt rows → fetched even if cnt >= TA_MIN_ROWS
- AC-4: Per-ticker fetch errors isolated; other tickers continue
- AC-5: Return `{ covered, backfilled, sparse, errors }` where sparse = API returned < TA_MIN_ROWS rows

---

## §2-impl

## [Developer] Implementation Record

- **Files modified:**
  - `apps/mcp-server/src/scheduler/market-data/taOhlcvBackfillJob.ts` (NEW, 216L) — core job: watchlist read, coverage check (cnt + low=0 corrupt count), INSERT OR REPLACE upsert, per-ticker error isolation
  - `apps/mcp-server/src/scheduler/cronConfig.ts` — added `taOhlcvBackfill: '30 1 * * 1-5'` entry with env override `CRON_TA_OHLCV_BACKFILL`
  - `apps/mcp-server/src/scheduler/startScheduler.ts` — added import + `cron.schedule(CRONS.taOhlcvBackfill, ...)` wired to `jobRunRepo.wrapRun('ta-ohlcv-backfill', ...)`
  - `docs/standards/cron-jobs.md` — added "OHLCV Data Quality & TA Indicator Restoration" section with job spec and TA_MIN_ROWS rationale
  - `docs/WORK.md` — one-liner summary appended

- **Tests written:**
  - `apps/mcp-server/src/__tests__/1970-ta-ohlcv-backfill.test.ts` — 10 tests, 33 assertions, GREEN
  - AC-1a: ticker with >= TA_MIN_ROWS clean rows → covered, no fetch
  - AC-1b: ticker with > TA_MIN_ROWS clean rows → covered, no fetch
  - AC-2a: ticker with 0 rows → fetched + inserted via INSERT OR REPLACE
  - AC-2b: ticker with TA_MIN_ROWS - 1 rows → fetched (strict threshold)
  - AC-2c: INSERT OR REPLACE overwrites corrupt low=0 row with clean value
  - AC-3: ticker >= TA_MIN_ROWS but has low=0 → still fetched
  - AC-4: one ticker fetch error → others succeed, error counted
  - AC-5: API returns < TA_MIN_ROWS rows → counted as sparse
  - AC-5b: empty watchlist → all zeros, no fetch
  - AC-5c: multi-ticker summary correctness (3 covered, 2 backfilled, 1 sparse, 1 error)

- **Key design decisions:**
  - `TA_MIN_ROWS = 35`: MACD(26,9) needs 34 prices minimum; 35 adds one buffer row
  - `INSERT OR REPLACE` (not `INSERT OR IGNORE` from `ohlcvBackfill.ts`) — required to overwrite 1972-era corrupt rows
  - `corrupt_cnt = SUM(CASE WHEN low = 0 THEN 1 ELSE 0 END)` — detects corrupt rows from 1972 bug
  - Injectable `fetchFn` for testability — production uses direct VNDIRECT HTTPS (no VPS proxy needed per `ohlcvStartupProbe.ts` precedent)
  - Cron schedule: `30 1 * * 1-5` (01:30 UTC = 08:30 VN, pre-market open) — runs before TA alert scan at 02:00 UTC
  - Per-ticker error isolation: `try/catch` per ticker, errors accumulated in result
  - Rate limit: 200ms between requests (configurable via `deps.delayMs`)

- **Git commits:** pending QA approval
- **tsc status:** clean (0 errors)
- **Full suite:** 9700 tests / exit 0 (9380 pass / 285 fail — 285 = pre-existing BCTC freeze, zero regressions)
- **Docs updated:** `docs/standards/cron-jobs.md` (OHLCV section added), `docs/WORK.md` (one-liner)
- **Graphify:** skipped (no doc structural change — only new section in existing file)

### HANDOFF_DELTA
- `last_read_anchor: "## §2-impl"`
- `last_read_at: "2026-05-22T06:00Z"`
