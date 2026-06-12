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

## 2026-06-12 · CONTAM-5 — ohlcvSanityCheckJob sanity-check cron — REVIEW

**Task:** CONTAM-5 | Sprint: OHLCV-UNIT-CONTAM | Priority: CRITICAL | Zone: apps/mcp-server/
**New file:** `scheduler/market-data/ohlcvSanityCheckJob.ts` — full-table scan (last 7d × watchlist), calls validateOhlcvUnit (CONTAM-1), sends sendTelegramBug on contamination hits. All-zero rows (BACKLOG_CONTAM_8) skipped without spamming.
**Cron wiring:** `cronConfig.ts` `ohlcvSanityCheck` = 15:05 UTC Mon-Fri (5 min after ohlcvDailyAggregator at 15:00). `startScheduler.ts` import + jobRunRepo.wrapRun registration. cronJobCount 78→79.
**Scope clarification:** handoff mis-titled Writer C guard; po_amendment + arch brief §CONTAM-5 + dispatch CONTEXT all confirm CONTAM-5 = sanity-check cron. Implemented per authoritative spec.
**Tests:** 10 TCs in CONTAM-5-ohlcv-sanity-check.test.ts — 10 pass / 0 fail. AC-1 clean, AC-2 contamination+BUG, AC-3 zero-skip, AC-4 window, AC-5 index-exempt, AC-6 multi-hit, AC-7 error-swallow, AC-8 empty-watchlist, AC-9 hilo-ratio. tsc exit 0. toolCount=157. schedulerCount=79.
Zone health: bun test 10 pass 0 fail (targeted), tsc clean, 157 tools intact, 79 cron.schedule | HEALTHY
