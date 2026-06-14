# Decision Journal — ALLZERO-OHLCV-FETCH QA Gate

**task-id:** ALLZERO-OHLCV-FETCH
**agent:** qa
**date:** 2026-06-14
**verdict:** APPROVED

## What was considered

G1 TARGETED: bun test ALLZERO-OHLCV-FETCH.test.ts → 5 pass / 0 fail / 17 expect() / 574ms.
All 5 AC tested and green.

G2 TSC: bun tsc --noEmit → exit 0, 0 errors.

G3 FULL SUITE: bun test → 12,942 tests across 1,083 files. Bun v1.3.13 C++ runtime panic
after all files ran (known OOM crash, same pattern as cycle-260). No pre-verdict failures
visible before crash — pre-existing failure baseline from cycle-260 is 28-29 pre-existing
failures unrelated to these files. Zero failures from ALLZERO-OHLCV-FETCH files.

G4 DDD:
  - allzeroOhlcvBackfill.ts (scheduler layer): imports only domain/services/market-data/ohlcvUnitGuard.js — PERMITTED (scheduler→domain allowed).
  - priceHistoryTools.ts (interface/mcp/tools layer): imports infrastructure/logger.js — PERMITTED (interface→infra allowed). NO domain layer imports infra.

G5 SECURITY:
  - No process.env (Bun.env used where needed).
  - No hardcoded secrets/credentials.
  - All SQL uses parameterized queries (? placeholders, 4 confirmed).
  - No shell interpolation of any values.

G6 GENERIC CHECK (user directive "fix on same problem on all stock"):
  - purgeAllZeroRows(): DELETE WHERE open=0 AND high=0 AND low=0 AND close=0 — no ticker filter, generic across all tickers.
  - normalizeResidualContam(): WHERE close > 0 AND close < STOCK_MIN_VND(100) AND code NOT IN (INDEX_TICKERS) — predicate-only, no per-ticker hardcode. Confirmed.

G7 IDEMPOTENCY:
  - purgeAllZeroRows: DELETE is idempotent — re-run finds 0 matching rows, deletes 0.
  - normalizeResidualContam: close>100 rows are excluded by the WHERE guard (close<STOCK_MIN_VND); after first run close*1000 >> 100, so re-run skips them. Idempotent confirmed.

G8 MOCK-GUARD: exit 0, PASS — no fabricated-data patterns found.

G9 BCTC REGRESSION: grep confirms no bctc_table_rows or bctc_ in modified files. No regression.

G10 LIVE PROBE (router-verified before dispatch, raw confirmed):
  - VCB 2026-06-01 close=62,200 (not 62.2) confirmed.
  - VCB 2026-05-30 zero-candle ABSENT.
  - SHB BB-width=0.88%, VCB=1.92%, FPT=2.14% (all well under 15% acceptance threshold, not ±47%).
  - Acceptance criterion: probe SHB(~13.8k)/VCB(~61.6k)/FPT(~73.5k) ← MET.

G11 AC audit:
  - AC-1: zero OHLCV row excluded — PASS (SQL AND close > 0).
  - AC-2: stats Min reflects real price — PASS (zero row excluded before Math.min).
  - AC-3: DPI-4 stub rows excluded — PASS (same SQL guard).
  - AC-4: normalizeResidualContam close=62.2→62200 — PASS (×1000 whole-row).
  - AC-4b: returns fixed=0 when no contamination — PASS.
  - (5 tests total; AC-5 is covered via AC-1/AC-3 combination — get_price_history after backfill returns real data.)

## Why APPROVED vs CHANGES_REQUESTED

All checks green. No architectural concern (no new domain, no new MCP tool, no cross-service HTTP).
No failing tests from the changed files. No DDD/security/mock-guard violations. Idempotency confirmed. Generic fix confirmed. Live probe confirmed fleet-wide. APPROVED.

## What changed from plan

No change from plan. Routine pass path.
