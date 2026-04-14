# Task Report — 1193: Push-Prices Post-Upsert Observability

**Branch:** task/1193-fix-price-persistence
**Reviewed by:** QA Agent
**Date:** 2026-04-13
**Verdict:** PASS

---

## Summary

Task 1193 adds post-upsert observability to the `/api/push-prices` handler in
`src/interface/mcp/server.ts`. The change introduces:

1. `startMs` captured with `Date.now()` immediately before the upsert loop
   (line 375), before any DB write occurs.
2. A post-upsert `SELECT COUNT(*) AS n FROM market_prices WHERE updated_at >= ?`
   verification block (lines 425-443) that runs synchronously before the HTTP
   response is sent.
3. `log.error` emission when `verified.n === 0 && count > 0`, surfacing
   DB singleton stale-FD failures in the server log immediately.
4. `lag_ms` computed as `Date.now() - startMs` inside the verify block.

The upsert loop itself (INSERT OR REPLACE logic, change_pct computation via
ref_price, OHLCV fallback chain) is unchanged.

---

## Test Results

### Task-specific tests

```
bun test src/__tests__/1193-push-prices-persist.test.ts
7 pass / 0 fail / 14 expect() calls
```

All 7 tests pass:
- upserts 3 tickers into market_prices (COUNT = 3)
- post-upsert visible count matches inserted count (visible = 3)
- logs vps_push_log with status='ok' and items_count=3 after successful push
- lag_ms is non-negative (startMs captured before upsert)
- skips items with null/missing price or empty code
- repeated push with same ticker upserts (idempotent — COUNT=1 not 2)
- visible=0 and count=0 when payload is empty (nothing written)

### Full regression suite

bun test — no failures detected across the full suite. TypeScript strict check
(`bun tsc --noEmit`) passed with zero errors.

---

## Acceptance Criteria Verification

| Criterion | Status | Evidence |
|---|---|---|
| 7 tests pass in 1193-push-prices-persist.test.ts | PASS | 7/7 green, 0 fail |
| startMs captured before upsert loop | PASS | server.ts line 375, before db.prepare at line 378 |
| post-upsert verify block emits log.error when visible===0 && count>0 | PASS | server.ts lines 434-438 |
| No functional change to the upsert itself | PASS | INSERT OR REPLACE block unchanged; ref_price/OHLCV fallback intact |

---

## DDD Compliance

- `src/domain/` does not import from `src/application/` (clean).
- Pre-existing `import type` references from `domain/services/` to
  infrastructure type definitions (e.g. `VnstockIntradayTick`) are unchanged
  and pre-date this task. No new cross-layer violations introduced.

## Security Scan

- No `Bun.env` regressions; the handler correctly uses `Bun.env.VPS_PUSH_API_KEY`
  (line 337).
- Two pre-existing `process.env["DB_PATH"]` references in `schema.ts` exist
  for test-override compatibility; not introduced by this task.

---

## Files Changed

- `src/interface/mcp/server.ts` — added startMs capture + post-upsert verify block
- `src/__tests__/1193-push-prices-persist.test.ts` — new test file (7 tests)
