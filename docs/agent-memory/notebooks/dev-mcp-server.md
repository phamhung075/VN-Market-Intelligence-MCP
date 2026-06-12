# dev-mcp-server -- Notebook

## 2026-06-12 · REAUDIT-004 — stockPerformance direction field (NFR-C-4) — REVIEW

**Task:** REAUDIT-004 | Sprint: SHIP-WAVE-REAUDIT | Priority: MEDIUM | Zone: apps/mcp-server/
**Change:** `interface/mcp/routes/marketSummaryHandler.ts` — added `direction: "up" | "down" | "flat"` to `StockPerformanceItem` type; added exported `deriveDirection(changePct)` pure helper (null/undefined/NaN → "flat"); wired into `buildDetail()` map: passes raw changePct through `deriveDirection()` rather than defaulting to 0.
**Key decision:** Derived at read time in interface layer (no DB change). `deriveDirection` handles null/undefined/NaN edge cases gracefully. Previous session had already partially landed the implementation in the handler; this run confirmed the code was correct, wrote missing tests, and committed.
**Tests:** `REAUDIT-004-stock-perf-direction.test.ts` — 11 pass / 0 fail (AC-1..AC-10 + null JSON guard). Combined 82 pass / 0 fail with REAUDIT-002/003 + TASK17-SUMMARIES. tsc clean. toolCount=157. schedulerCount=79.
**Commit:** a22d2257
Zone health: tsc clean, 157 tools intact, 79 cron.schedule, 11 new tests GREEN | HEALTHY

---

## 2026-06-12 · CONTAM-3 — Writer B /api/push-ohlcv-history unit guard — REVIEW

**Task:** CONTAM-3 | Sprint: OHLCV-UNIT-CONTAM | Priority: CRITICAL | Zone: apps/mcp-server/
**Change:** `interface/mcp/server.ts` — added `validateOhlcvUnit` import from `domain/services/market-data/ohlcvUnitGuard.js`. In `/api/push-ohlcv-history` bar loop: try/catch guard before `stmt.run()`, rejects bars where open/high/low/close out of full-VND range for stock type. HTTP 200 preserved regardless of guard outcome (RF-1 VPS backoff prevention). `skipped` counter added to log and response body.
**Key decision:** TCBS backfill always stock type (fetch-ohlcv-backfill.sh spec confirmed); guard-only (no normalize) correct because TCBS delivers full-VND (arch brief §Writer B confirmed).
**Tests:** 37 pass / 0 fail (targeted: unit/ + CONTAM-4 + REAUDIT-003). tsc clean. toolCount=157. schedulerCount=79 (sibling CONTAM-5 added 1 cron — not this task).
**Commit:** d1379fa4
Zone health: tsc clean, 157 tools intact, targeted tests 37 pass / 0 fail | HEALTHY

---

## 2026-06-12 · CONTAM-1 — ohlcvUnitGuard.ts domain service — REVIEW

**Task:** CONTAM-1 | Sprint: OHLCV-UNIT-CONTAM | Priority: CRITICAL | Zone: apps/mcp-server/
**New file:** `domain/services/market-data/ohlcvUnitGuard.ts` — `validateOhlcvUnit(code,type,open,high,low,close)` + `normalizeOhlcvToVnd(type,v)`. Constants: STOCK_MIN_VND=100, STOCK_MAX_VND=10M, HILO_RATIO_MAX=5. Pure function, no I/O.
**Key design:** normalizeOhlcvToVnd scales WHOLE row by ×1000 when max(o,h,l,c)<100 (stock type) — never per-field. Index type always returned unchanged. Zero row passed through unchanged (let validator reject it). TC-9 correctly catches that open=100/close=10M spans a ratio of 100000>5 (invalid).
**Tests:** 17 TCs in unit/ohlcvUnitGuard.test.ts — all GREEN. 3 describe blocks: validateOhlcvUnit (9 cases), normalizeOhlcvToVnd (4 cases), constants (3 cases). tsc exit 0. toolCount=157. schedulerCount=78.
**Commit:** 5762ec3d
Zone health: bun test 17 pass 0 fail (targeted), tsc clean, 157 tools intact, 78 cron.schedule (unchanged) | HEALTHY

---

## 2026-06-12 · CONTAM-4 — Writers D & E VNDIRECT normalize-then-guard — REVIEW

**Task:** CONTAM-4 | Sprint: OHLCV-UNIT-CONTAM | Priority: CRITICAL | Zone: apps/mcp-server/
**Root cause confirmed:** VNDIRECT api-finfo v4/stock_prices returns THOUSAND-VND for all tickers (live-probe 2026-06-12: KSD=4.9, VHH=2.7, NQB=10.1 — same endpoint for both Writer D and E). Writer D (taOhlcvBackfillJob) and Writer E (ohlcvBackfill) were inserting thousand-scale rows without normalization, seeding contaminated VNH=0.9 rows.
**Fix (taOhlcvBackfillJob.ts):** Imported normalizeOhlcvToVnd + validateOhlcvUnit. In insertMany transaction: normalize WHOLE row ×1000 (try/catch), guard post-normalize values (try/catch), upsert normalized full-VND. ON CONFLICT DO UPDATE self-heals contaminated seeds.
**Fix (ohlcvBackfill.ts):** Same import + same normalize-then-guard-then-upsert pattern. console.error for guard rejects (no logger import in this file). INSERT OR IGNORE — does not overwrite existing rows (self-heal is Writer D's role).
**Writer E live-probe:** Same `api-finfo.vndirect.com.vn/v4/stock_prices` endpoint → THOUSAND-VND confirmed; normalize pattern applied identically.
**Tests:** 7 TCs in CONTAM-4-writers-d-e-normalize.test.ts — all GREEN. AC-D1 VNH 0.9→900, AC-D2 full-VND no-op, AC-D3 seed self-heal, AC-D4 zero-row rejected, AC-D5 row-count not dropped, AC-E1 Writer E normalize, AC-E2 Writer E new-date written. Full suite: 12770 pass / 0 fail (exit 0). tsc clean. toolCount=157. schedulerCount=78.
Zone health: bun test 12770 pass 0 fail, tsc clean, 157 tools intact, 78 cron.schedule — HEALTHY

---

## 2026-06-12 · CONTAM-2 — Writer A unit guard + ON CONFLICT open self-heal — REVIEW

**Task:** CONTAM-2 | Sprint: OHLCV-UNIT-CONTAM | Priority: CRITICAL | Zone: apps/mcp-server/
**Root cause:** pushPricesHandler.ts ON CONFLICT clause never updated `open`; first-push type-misclassified row set open=pv (thousand-VND, ~0.9); subsequent correct pushes set close=full-VND (~1000); result: mixed-unit row.
**Fix 1 (import):** Added `validateOhlcvUnit` from `domain/services/market-data/ohlcvUnitGuard.js` at file top.
**Fix 2 (ON CONFLICT):** Added `open = CASE WHEN daily_ohlcv.open < 100 THEN excluded.open ELSE daily_ohlcv.open END` — contaminated open self-heals on next valid push.
**Fix 3 (guard):** Before `ohlcvUpsert.run()`, call `validateOhlcvUnit`; on invalid: `log.error + continue`. try/catch wraps guard call (RF-1: VPS always gets HTTP 200).
**Tests:** 6 TCs in 1987-contam2-push-prices-ohlcv-guard.test.ts — all GREEN. Covers guard reject, self-heal, valid pass, zero guard, open-preserved, HTTP-200-on-all-rejected.
**Commit:** a7f658fb | tsc exit 0. toolCount=157. schedulerCount=78.
Zone health: bun test 6 pass 0 fail (targeted), tsc clean, 157 tools intact, 78 cron.schedule | HEALTHY
