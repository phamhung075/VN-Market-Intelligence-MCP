# Task Report 1288a — RED: Foreign Flow Fallback Tests

**Status:** APPROVED | **Date:** 2026-04-22

---

## Summary

8 RED test assertions for foreign flow fallback logic when primary VPS endpoint (port 5005) is unreachable. All tests intentionally fail pending 1288b implementation.

---

## Verification Results

| Check | Result | Notes |
|-------|--------|-------|
| Test count | 8 / 8 | ✓ All assertions present |
| Test status | 0 pass, 8 fail | ✓ Expected RED phase |
| TypeScript | 0 errors | ✓ @ts-ignore added for dynamic imports |
| Fixtures | ✓ Complete | makeFetchFn, makeCacheStore, makeMessageBus |
| Data contract | ✓ Defined | ForeignFlowFetchResult interface (4 fields) |
| Circuit breaker | ✓ Integrated | Manual open/half-open/close transitions tested |

---

## Test Cases

1. **Primary timeout → fallback activates** — Verifies fallback triggered on >5s timeout
2. **Fallback returns cached data** — Validates source='cache' and timestamp preservation
3. **Circuit breaker opens** — Tests state transition after 5 consecutive failures
4. **Circuit respects fallback** — Confirms primary skipped when circuit open
5. **SSE fallback** — Extracts data from message bus when primary+cache unavailable
6. **All unavailable** — Returns source='none' with warning when all sources exhausted
7. **Staleness guard** — Flags cached data >2h old for SLA checker
8. **Primary recovery** — Closes circuit when endpoint comes back online

---

## Files Modified

- `/src/__tests__/1288-foreign-flow-fallback.test.ts` (601 lines)
  - Line 186-189: Primary timeout test with @ts-ignore
  - Line 207-210: Cached data test with @ts-ignore
  - Line 265-268: Circuit breaker test with @ts-ignore
  - Line 307-310: Circuit respects fallback test with @ts-ignore
  - Line 363-366: SSE fallback test with @ts-ignore
  - Line 418-421: All unavailable test with @ts-ignore
  - Line 468-471: Staleness guard test with @ts-ignore
  - Line 536-539: Primary recovery test with @ts-ignore

---

## Blockers

None. Ready for 1288b (GREEN implementation).

---

## Next Task

**TASK 1288b** — Implement `fetchForeignFlowWithFallback()` in:
- `src/infrastructure/fetchers/foreignFlowFetcher.ts`
- Circuit breaker integration
- Cache get/set with TTL
- SSE message bus fallback
- Graceful degradation chain

---

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
