# dev-mcp-server -- Notebook

## 2026-06-12 · EVIDENCE-ACCUM-SILENT-CRON — node-cron silent tick drop fix — REVIEW

**Task:** EVIDENCE-ACCUM-SILENT-CRON | Priority: HIGH | Zone: apps/mcp-server/src/scheduler/
**Root cause:** node-cron v3.0.3 drops ticks under event loop saturation (vnstockFundamentalsJob startup sweep at 16:00 UTC). `matchTime()` fires late; `missedExecutions > 0`; for `i > 0`, emission skipped when `recoverMissedExecutions=false`. Same mechanism took reputationComputeJob 2026-06-11, evidenceAccumulatorJob 2026-06-12.
**Fix (3-part):** (1) `recoverMissedExecutions: true` on evidenceAccumulator + reputationCompute cron registrations. (2) Same-day DB-backed dedup guard in `runEvidenceAccumulatorWithDb` — blocks double-execution on same UTC day. (3) Double-wrap fix: `startupHelpers.ts` default fn changed from `runEvidenceAccumulatorJob()` (which called `recordJobRun` internally) to `runEvidenceAccumulator(db)` — eliminates the two-row-per-tick pattern visible on 2026-06-07/08.
**Tests:** 8 new assertions in EVIDENCE-ACCUM-SILENT-CRON.test.ts (T1-T7 dedup states). 12870 pass / 0 fail. tsc exit 0. toolCount=157. schedulerCount=79.
**Commit:** 53d00955
Zone health: tsc clean, 157 tools intact, 79 cron.schedule, systemic cron-miss class fixed (recoverMissedExecutions) | HEALTHY

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

---

## 2026-06-12 · QUE-TOOLTIP-DRY-3 — hexagramLibrary.ts downstream annotation — REVIEW

**Task:** QUE-TOOLTIP-DRY-3 | Sprint: QUE-TOOLTIP-DRY | Priority: HIGH | Zone: apps/mcp-server/src/domain/services/kinhDich/
**Change:** `hexagramLibrary.ts` file-header — replaced 3-line `//` comment with 7-line JSDoc block: AUTO-GENERATED downstream of apps/kinh-dich-service/dashboard/que-reference.js. DO NOT EDIT description text independently. PO-Q2 enforcement per arch brief Option B.
**Key decision:** comment-only; zero data changes, zero TS type changes. kinhDichTools.ts runtime reads state.trend — unaffected.
**Tests:** 107 pass / 0 fail (kinhDich targeted: hexagram-library + hexagram-library-rebuild + kinhdich-tools + kinhdich-differentiation-smoke). tsc clean. toolCount=157. schedulerCount=79.
**Commit:** 66621b03
Zone health: tsc clean, 157 tools intact, 79 cron.schedule, annotation-only change no behavior drift | HEALTHY
