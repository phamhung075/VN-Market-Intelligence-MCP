# dev-mcp-server -- Notebook

## 2026-06-11 · REAUDIT-001 — Fix reputation trend always stable — DONE

**Task:** REAUDIT-001 | Sprint: SHIP-WAVE-REAUDIT | Priority: CRITICAL | Zone: apps/mcp-server/
**Root cause:** reputationComputeJob computed priorDate=today-7d and called getReputation(db,code,priorDate) with WHERE date=? exact match. Production rows land at irregular intervals (3-7d gaps) so lookup always returned null → priorScore=undefined → trend="stable" for 100% of 235 rows.
**Fix 1 (reputationStore.ts):** Added getReputationPrior(db,code,beforeDate) — WHERE code=? AND date < ? ORDER BY date DESC LIMIT 1. Parameterized SQL. Returns ReputationScore|null.
**Fix 2 (reputationComputeJob.ts):** Removed priorDate offset calc. Replaced getReputation(db,code,priorDate) with getReputationPrior(db,code,today). Import updated.
**Tests:** 9 new TCs. 81 pass / 0 fail. tsc exit 0. toolCount=157. schedulerCount=78.
**QA timing:** trend values update only on next 08:30 UTC cron run after ops rebuild.
**Commit:** b9f003ab | Zone health: HEALTHY

---

## 2026-06-11 · REAUDIT-002 — NFR-C-1 stale flags on 5 handlers — DONE

**Task:** REAUDIT-002 | Sprint: SHIP-WAVE-REAUDIT | Priority: HIGH | Zone: apps/mcp-server/
**New file:** `_staleness.ts` — `computeStaleness(asOfDate, thresholdDays, now)` utility. Null/empty-safe. Injectable clock. Returns `{stale, staleByDays}`.
**5 handlers updated:** conviction-history (2d/tradingDate), corporate-events (3d/max eventDate), shareholders (55d/asOf), financials (14d/asOf), reputation (3d/asOf). `now` param added to each for testability. All existing response fields unchanged (additive contract).
**Live stale state (2026-06-11):** shareholders stale=true staleByDays=3 (asOf=2026-04-14, 58d); financials stale=true staleByDays=43 (asOf=2026-04-15, 57d); others within threshold.
**Tests:** 24 new TCs in REAUDIT-002-staleness.test.ts. 257 existing handler tests GREEN. tsc exit 0. toolCount=157. schedulerCount=78.
**Commit:** 70a33a80 | Zone health: HEALTHY

---

## 2026-06-11 · REAUDIT-003 — NFR-C-5 stale_fields in ForeignFlowResponse — REVIEW

**Task:** REAUDIT-003 | Sprint: SHIP-WAVE-REAUDIT | Priority: HIGH | Zone: apps/mcp-server/
**Root cause:** currentHoldingRatio, maxHoldingRatio, marketCapBn are null on 100% of ~103 rows (structural upstream gap). Handler correctly passed them through as null, but response had no signal to distinguish "not available" from "missing today".
**Fix (foreignFlowHandler.ts):** Added `stale_fields: string[]` to `ForeignFlowResponse` interface. Added `computeStaleFields(items)` — scans allItems (full day set) post-buildSummary; if >50% null for a field, appends field name to array. Updated `handleGetForeignFlow` to compute and include `stale_fields`. Additive contract — items still carry null values unchanged.
**Tests:** 13 new TCs in REAUDIT-003-foreign-flow-stale-fields.test.ts. AC-2 empty→[], AC-3 all-null→3-fields, AC-4 exactly-50%-not-stale (strict >50%), AC-5 >50%→stale, AC-6 mixed, AC-8 majority-non-null, HTTP handler integration. 44 pass / 0 fail (targeted). tsc exit 0. toolCount=157. schedulerCount=78.
**Commit:** f662302d | Zone health: HEALTHY

---

## 2026-06-12 · CONTAM-1 — ohlcvUnitGuard.ts domain service — REVIEW

**Task:** CONTAM-1 | Sprint: OHLCV-UNIT-CONTAM | Priority: CRITICAL | Zone: apps/mcp-server/
**New file:** `domain/services/market-data/ohlcvUnitGuard.ts` — `validateOhlcvUnit(code,type,open,high,low,close)` + `normalizeOhlcvToVnd(type,v)`. Constants: STOCK_MIN_VND=100, STOCK_MAX_VND=10M, HILO_RATIO_MAX=5. Pure function, no I/O.
**Key design:** normalizeOhlcvToVnd scales WHOLE row by ×1000 when max(o,h,l,c)<100 (stock type) — never per-field. Index type always returned unchanged. Zero row passed through unchanged (let validator reject it). TC-9 correctly catches that open=100/close=10M spans a ratio of 100000>5 (invalid).
**Tests:** 17 TCs in unit/ohlcvUnitGuard.test.ts — all GREEN. 3 describe blocks: validateOhlcvUnit (9 cases), normalizeOhlcvToVnd (4 cases), constants (3 cases). tsc exit 0. toolCount=157. schedulerCount=78.
**Commit:** 5762ec3d
Zone health: bun test 17 pass 0 fail (targeted), tsc clean, 157 tools intact, 78 cron.schedule (unchanged) | HEALTHY
