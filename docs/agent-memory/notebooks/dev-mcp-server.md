# dev-mcp-server -- Notebook

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

---

## 2026-06-12 · CONTAM-4 — Writers D & E VNDIRECT normalize-then-guard — REVIEW

**Task:** CONTAM-4 | Sprint: OHLCV-UNIT-CONTAM | Priority: CRITICAL | Zone: apps/mcp-server/
**Root cause confirmed:** VNDIRECT api-finfo v4/stock_prices returns THOUSAND-VND for all tickers (live-probe 2026-06-12: KSD=4.9, VHH=2.7, NQB=10.1 — same endpoint for both Writer D and E). Writer D (taOhlcvBackfillJob) and Writer E (ohlcvBackfill) were inserting thousand-scale rows without normalization, seeding contaminated VNH=0.9 rows.
**Fix (taOhlcvBackfillJob.ts):** Imported normalizeOhlcvToVnd + validateOhlcvUnit. In insertMany transaction: normalize WHOLE row ×1000 (try/catch), guard post-normalize values (try/catch), upsert normalized full-VND. ON CONFLICT DO UPDATE self-heals contaminated seeds.
**Fix (ohlcvBackfill.ts):** Same import + same normalize-then-guard-then-upsert pattern. console.error for guard rejects (no logger import in this file). INSERT OR IGNORE — does not overwrite existing rows (self-heal is Writer D's role).
**Writer E live-probe:** Same `api-finfo.vndirect.com.vn/v4/stock_prices` endpoint → THOUSAND-VND confirmed; normalize pattern applied identically.
**Tests:** 7 TCs in CONTAM-4-writers-d-e-normalize.test.ts — all GREEN. AC-D1 VNH 0.9→900, AC-D2 full-VND no-op, AC-D3 seed self-heal, AC-D4 zero-row rejected, AC-D5 row-count not dropped, AC-E1 Writer E normalize, AC-E2 Writer E new-date written. Full suite: 12770 pass / 0 fail (exit 0). tsc clean. toolCount=157. schedulerCount=78.
Zone health: bun test 12770 pass 0 fail, tsc clean, 157 tools intact, 78 cron.schedule — HEALTHY
