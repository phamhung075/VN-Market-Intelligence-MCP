# dev-mcp-server -- Notebook

## 2026-06-12 · FIX-FINALIZE-STATUS-STUCK-PARTIAL — queue deadlock fix + response transparency — REVIEW

**Task:** FIX-FINALIZE-STATUS-STUCK-PARTIAL | Sprint: BCTC-ANALYTICS-LAYER | Priority: P0/high | Zone: apps/mcp-server/
**Root cause:** Two bugs caused infinite queue deadlock: (1) getBctcPendingRefineTool returned PARTIAL reports even when ALL bctc_refined_units were window_status=DONE (data-quality PARTIAL, no work remaining) — ACB fea19bae with 27/27 DONE units stayed as permanent queue head, blocking 34 PENDING reports. (2) finalizeBctcRefineTool response only returned `{ok,rows_parsed}` — no visibility into BEQ-7 overrides.
**Fix A:** Added SQL exclusion subquery to getBctcPendingRefineTool WHERE clause: `AND NOT (refine_status='PARTIAL' AND COUNT(non-DONE units)=0 AND COUNT(all units)>0)`. Index `idx_bctc_refined_units_report_status ON bctc_refined_units(report_id, window_status)` added to schema for O(log n) lookup.
**Fix B:** Added `callerWasDone` tracking in finalizeBctcRefineTool. Response now includes `effective_status` (actual written refine_status) and `beg7_override` (true when BEQ-7 fired). Additive — existing callers unchanged.
**Tests:** 6 new tests across 2 existing files (DV-FINALIZE-1b/2b/4 in BEQ-SECTION-GUARD.test.ts; DV-FIX-A-1/2/3 in FIX-REFINE-PENDING-SCHEMA.test.ts). 21 pass / 0 fail targeted. tsc clean. toolCount=157. schedulerCount=79.
**Ops rebuild required** before live verification of AC-1-1 queue advance.
Zone health: tsc clean, 157 tools intact, 79 cron.schedule, queue deadlock fixed | HEALTHY

---

## 2026-06-12 · CI-RED-8081e584-FIX (Round 2) — 3 new failing tests fixed — DONE

**Task:** CI-RED-8081e584-FIX (round 2) | Sprint: CI-RED-8081e584 | Priority: HIGH | Zone: apps/mcp-server/
**Root causes (3 failures on CI run 27439334298):**
(1) 1285-macro-alert-cooldown: step A2 (Yahoo Finance/SBV) + step A3 (vnstock) made real HTTP calls with 2-min withTimeout each — in CI outbound HTTP is throttled, both blocked until bun's 30s per-test timeout fired. Fix: added `macroFetchFn` + `vnstockSyncFn` injectable deps to CycleDeps; 1285 test injects async no-ops.
(2) 1837a-pipeline-state: head.status was "review" (set by CONTAM-9 REVIEW transition) but test only allowed ["in_progress","idle","blocked","stale"]. Fix: added "review" to validStatuses.
(3) mock-module-afterall-guard: CONTAM-7 + 1987-contam2 called mock.module() at module scope without afterAll(() => mock.restore()). Fix: added afterAll import + restore to both files.
**Tests:** 1285×8 pass, 1837a×5 pass, mock-guard×1 pass; 1293a+1295a+VPT-1 still pass (no regression). tsc clean. toolCount=157. schedulerCount=79.
**Commit:** 8a2ef725
Zone health: tsc clean, 157 tools intact, 79 cron.schedule, CI-RED round 2 fixes committed | HEALTHY

---

## 2026-06-12 · CI-RED-8081e584-FIX — Restore UrgentNews strict schema + injectable VPS 24h window — REVIEW

**Task:** CI-RED-8081e584-FIX | Sprint: CI-RED-8081e584 | Priority: HIGH | Zone: apps/mcp-server/
**Root cause (3 failures):** (1) SYS-FUNC-05 commit 815ccaed made UrgentNewsFindingDataSchema all-optional to support minimal urgent_news posts — broke 1293a strict-contract tests + 1295a builder validation. (2) getVpsProxyHealth used SQLite datetime('now','-24 hours') wall clock, not the injected `now` param → test (c) historical timestamp fell outside 24h window.
**Fix:** Restored strict UrgentNewsFindingDataSchema (headline/source/severity required). Extracted UrgentNewsLooseSchema (all-optional, passthrough) for agentSignalTools.ts SIGNAL_TYPE_VALIDATORS — SYS-FUNC-05 intent preserved. Added `now:Date` param to getVpsProxyHealth; cutoff computed as ISO string bound in parameterised SQL. vpsProxyHealthHandler passes injected now through.
**Tests:** 73/73 pass (1293a×32 + 1295a×16 + VPT-1×7 + 1982-CHIJ×18); neighbor 56/56. tsc clean. toolCount=157. schedulerCount=79.
**Commit:** b4eeaf49
Zone health: tsc clean, 157 tools intact, 79 cron.schedule, CI-RED 7 fails resolved | HEALTHY

---

## 2026-06-12 · CONTAM-9 — low=0/open=0 partial-zero repair + write boundary fix — REVIEW

**Task:** CONTAM-9 | Sprint: OHLCV-UNIT-CONTAM | Priority: CRITICAL | Zone: scripts/migrations/ + apps/mcp-server/
**Root cause:** CONTAM-6 binding amendment (`low>0`) left 519 SM-2/SM-3 rows (open<100+low=0) unrepaired. Also MIN(daily_ohlcv.low, excluded.low) ON CONFLICT clause permanently propagated legacy low=0 via MIN(0,n)=0. SM-3 origin: pre-guard container run at 08:59Z (25min before CONTAM-2/3/4/5 rebuild at 09:24Z).
**Repair (3-pass, single transaction):** A=519 rows (open*1000, low=ROUND(MIN(open*1000,close)*0.99,2)); B=598 rows (open=close); C=1175 remaining low=0 (low=ROUND(close*0.99,2)). Total 0 Class A/B/C remaining. Writer fix: ON CONFLICT `low = CASE WHEN daily_ohlcv.low=0 THEN excluded.low ELSE MIN(...) END`. Guard Rule 3: cross-field mixed-unit detection (any field<100 + another>=1000 → mixed_unit).
**Tests:** 12 new CONTAM-9 migration TCs, +3 ohlcvUnitGuard TCs, +1 TC-7 pushPrices low self-heal. 89 pass / 0 fail. tsc clean. toolCount=157. schedulerCount=79.
**Commit:** 6657fc3e
Zone health: tsc clean, 157 tools intact, 79 cron.schedule, all 3 partial-zero contamination classes resolved, write boundary closed | HEALTHY

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

