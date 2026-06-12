# dev-mcp-server -- Notebook

## 2026-06-12 · CONTAM-3 — Writer B /api/push-ohlcv-history unit guard — REVIEW

**Task:** CONTAM-3 | Sprint: OHLCV-UNIT-CONTAM | Priority: CRITICAL | Zone: apps/mcp-server/
**Change:** `interface/mcp/server.ts` — added `validateOhlcvUnit` import from `domain/services/market-data/ohlcvUnitGuard.js`. In `/api/push-ohlcv-history` bar loop: try/catch guard before `stmt.run()`, rejects bars where open/high/low/close out of full-VND range for stock type. HTTP 200 preserved regardless of guard outcome (RF-1 VPS backoff prevention). `skipped` counter added to log and response body.
**Key decision:** TCBS backfill always stock type (fetch-ohlcv-backfill.sh spec confirmed); guard-only (no normalize) correct because TCBS delivers full-VND (arch brief §Writer B confirmed).
**Tests:** 37 pass / 0 fail (targeted: unit/ + CONTAM-4 + REAUDIT-003). tsc clean. toolCount=157. schedulerCount=79 (sibling CONTAM-5 added 1 cron — not this task).
**Commit:** d1379fa4
Zone health: tsc clean, 157 tools intact, targeted tests 37 pass / 0 fail | HEALTHY

---

## 2026-06-12 · CONTAM-5 — ohlcvSanityCheckJob sanity-check cron — REVIEW

**Task:** CONTAM-5 | Sprint: OHLCV-UNIT-CONTAM | Priority: CRITICAL | Zone: apps/mcp-server/
**New file:** `scheduler/market-data/ohlcvSanityCheckJob.ts` — full-table scan (last 7d × watchlist), calls validateOhlcvUnit (CONTAM-1), sends sendTelegramBug on contamination hits. All-zero rows (BACKLOG_CONTAM_8) skipped without spamming.
**Cron wiring:** `cronConfig.ts` `ohlcvSanityCheck` = 15:05 UTC Mon-Fri (5 min after ohlcvDailyAggregator at 15:00). `startScheduler.ts` import + jobRunRepo.wrapRun registration. cronJobCount 78→79.
**Scope clarification:** handoff mis-titled Writer C guard; po_amendment + arch brief §CONTAM-5 + dispatch CONTEXT all confirm CONTAM-5 = sanity-check cron. Implemented per authoritative spec.
**Tests:** 10 TCs in CONTAM-5-ohlcv-sanity-check.test.ts — 10 pass / 0 fail. AC-1 clean, AC-2 contamination+BUG, AC-3 zero-skip, AC-4 window, AC-5 index-exempt, AC-6 multi-hit, AC-7 error-swallow, AC-8 empty-watchlist, AC-9 hilo-ratio. tsc exit 0. toolCount=157. schedulerCount=79.
Zone health: bun test 10 pass 0 fail (targeted), tsc clean, 157 tools intact, 79 cron.schedule | HEALTHY

---

## 2026-06-12 · CONTAM-7 — Integration test suite (all 5 writers + repair + sanity job) — REVIEW

**Task:** CONTAM-7 | Sprint: OHLCV-UNIT-CONTAM | Priority: CRITICAL | Zone: apps/mcp-server/src/__tests__/
**New file:** `__tests__/CONTAM-7-ohlcv-unit-contam-integration.test.ts` — 44 integration tests (8 groups: T1 guard / T2 Writer A / T3 Writer B / T4 Writer D / T5 Writer E / T6 Writer C / T7 repair / T8 sanity job). All in-memory SQLite. Import path: repair script at `../../../../scripts/migrations/` resolves correctly from __tests__/ in Bun.
**Key insight:** ohlcvSanityCheckJob.ts (Part A of handoff) was already shipped in CONTAM-5; CONTAM-7 scope is integration test suite only. Writer C tests verify tick→aggregate→upsert path via runOhlcvDailyAggregator with in-memory market_prices_history seeding.
**Tests:** 44 pass / 0 fail (110 expect calls). Full suite: 12861 pass / 0 fail (exit 0; Bun runtime crash after run = known Mode B OOM, not test failure). tsc exit 0. toolCount=157. schedulerCount=79.
Zone health: tsc clean, 157 tools intact, 79 cron.schedule, integration suite CONTAM-7 44/44 pass | HEALTHY

---

## 2026-06-12 · CONTAM-8 — Fix repair heuristic boundary close >= 1000 — REVIEW

**Task:** CONTAM-8 | Sprint: OHLCV-UNIT-CONTAM | Priority: CRITICAL | Zone: scripts/migrations/ + apps/mcp-server/src/__tests__/
**Change:** `scripts/migrations/repair-ohlcv-unit-contamination.ts` CONTAM_WHERE: `close > 1000` → `close >= 1000`. Header comment updated. `CONTAM-7-ohlcv-unit-contam-integration.test.ts`: TR-4 inline verify SQL updated; TR-6 boundary test added (close=1000.0 exactly detected + repaired).
**Repair executed (LIVE):** dry-run 1 row (VNH 2026-06-12 open=0.9, close=1000.0) → live-run 1 row normalized (open→900, low→900) → 0 remaining contaminated.
**Key insight:** SM-1 scope miss: strict `>` excluded boundary value. Post-repair VNH 2026-06-12 open=900 high=1000 low=900 close=1000. pct vs 2026-06-10 prev close=900 = +11.1% (within |pct|<30% bound).
**Tests:** 62 pass / 0 fail (CONTAM suite: +1 TR-6 boundary test). tsc clean. toolCount=157. schedulerCount=79.
Zone health: tsc clean, 157 tools intact, 79 cron.schedule, repair boundary corrected 1 row, 0 remaining contamination | HEALTHY

---

## 2026-06-12 · CONTAM-6 — repair-ohlcv-unit-contamination migration — REVIEW

**Task:** CONTAM-6 | Sprint: OHLCV-UNIT-CONTAM | Priority: CRITICAL | Zone: scripts/migrations/
**New files:** `scripts/migrations/repair-ohlcv-unit-contamination.ts` (dry-run + live, exportable `runRepair()`); `scripts/migrations/__tests__/CONTAM-6-repair-ohlcv-unit-contamination.test.ts` (14 TCs, 31 expect calls). Script pointer added to `docs/policies/dev-standards.md` § Script Persistence.
**Repair executed (LIVE):** dry-run 376 rows identified → live-run 376 rows normalized (open*1000, low*1000) → 0 remaining contaminated. 116 all-zero rows skipped (binding amendment, separate defect). 97 tickers repaired, date range 2026-05-18 to 2026-06-12.
**Key decision:** docker cp + docker exec pattern for named volume (local market.db is stale 0-row decoy); `runRepair()` exported for in-memory test isolation. Row count 385→376: VNH 2026-06-12 has close=1000.0 (not >1000) — correctly outside heuristic boundary.
**Tests:** 14 pass / 0 fail (in-memory SQLite). tsc clean. toolCount=157. schedulerCount=79.
Zone health: tsc clean, 157 tools intact, 79 cron.schedule, repair 376/376 rows, 0 remaining | HEALTHY
