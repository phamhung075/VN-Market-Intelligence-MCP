# Handoff — TASK_1972: VnDirect OHLCV null-coercion fix

**Task:** 1972 | **Sprint:** active | **Severity:** FIX S | **Size:** S

---

## Summary

The VnDirect OHLCV backfill ingestion path (`ohlcvBackfill.ts`) coerced null/missing
`open`, `high`, and `low` fields to 0 (or a fallback) instead of skipping the record.
This produced ~1072 rows with `low=0` (and potentially `open=0` and `high=0`) in `daily_ohlcv`,
corrupting TA computations and P/L scoring. Tracked separately from TASK_1971 (Go scan-order
transposition in apps/stock-price/).

---

## Evidence

- **Coercion site:** `apps/mcp-server/src/infrastructure/fetchers/ohlcvBackfill.ts` transaction guard
  - Old guard: `if (!r.code || !r.date || r.close == null) continue;` — only checked `close`, not open/high/low
  - Old coercions: `r.open ?? 0` (null open → 0), `r.high ?? close`, `r.low ?? close`
  - If VnDirect returns `{code, date, close: 50000, open: null}`, wrote `open=0` to DB
  - If `r.low` is null AND close is 0 (API glitch), wrote `low=0` to DB
- **Impact:** 1072 residual `low=0` rows in `daily_ohlcv` (post-1971 scan-order fix)
- **PM context:** Tracked since 1971 close; independent fix lane (mcp-server zone only)

---

## Fix Applied

**File:** `apps/mcp-server/src/infrastructure/fetchers/ohlcvBackfill.ts`

Guard tightened — skip records with ANY null OHLCV field. `?? 0` / `?? close` fallbacks removed.

```typescript
// Before (bug):
if (!r.code || !r.date || r.close == null) continue;
upsert.run(code, date, r.open ?? 0, r.high ?? close, r.low ?? close, close, r.nmVolume ?? 0);

// After (fix):
if (!r.code || !r.date || r.open == null || r.high == null || r.low == null || r.close == null) continue;
upsert.run(r.code, r.date, r.open, r.high, r.low, r.close, r.nmVolume ?? 0);
```

---

## Acceptance Criteria

1. [x] Record with null `low` (but valid open/high/close) is NOT inserted into daily_ohlcv
2. [x] Record with null `open` (but valid high/low/close) is NOT inserted into daily_ohlcv
3. [x] Record with all OHLCV fields present IS inserted correctly
4. [x] Regression: record with null `close` is still skipped (pre-existing guard)
5. [x] tsc 0 errors, bun test 5/5 GREEN

---

## Owner & Zone

- **Dev agent:** dev-mcp-server
- **Zone:** apps/mcp-server/
- **Branch:** main (NO branches policy)
- **BCTC freeze NFR-3:** not BCTC-touching — CLEAR

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/infrastructure/fetchers/ohlcvBackfill.ts` — tightened guard in `insertMany` transaction. Added `r.open == null || r.high == null || r.low == null` checks alongside existing `r.close == null`. Removed `r.open ?? 0`, `r.high ?? close`, `r.low ?? close` coercions — replaced with direct `r.open`, `r.high`, `r.low` (guaranteed non-null after guard). Added explaining comment.
- **Tests written:**
  - `apps/mcp-server/src/__tests__/1972-vndirect-ohlcv-null-coercion.test.ts` — 5 assertions (AC-1..AC-5), all GREEN. Uses `globalThis.fetch` mock injected per-test; asymmetric OHLCV fixture (open=10/high=40/close=20, low=null) verifies no low=0 row produced.
- **Git commits:** see commit hash
- **Type check:** clean — tsc --noEmit 0 errors
- **Service tests:** 5/5 new tests GREEN; full suite 9370 pass / 285 fail (285 = pre-existing BCTC freeze, zero regression)
- **DB migration:** NOT REQUIRED — guard change only, no schema modification
- **Docs updated:** NONE — no microservice architecture docs impacted
- **Graphify:** skipped (no architecture docs touched)
