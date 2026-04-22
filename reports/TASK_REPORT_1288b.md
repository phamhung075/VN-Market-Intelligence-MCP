# Task Report 1288b — GREEN: Implement Foreign Flow Fallback Fetcher

**Status:** APPROVED | **Date:** 2026-04-22

---

## Summary

Implementation of `fetchForeignFlowWithFallback()` in `src/infrastructure/fetchers/foreignFlowFetcher.ts`. Handles graceful degradation when primary VPS foreign flow endpoint is unreachable: primary (circuit breaker wrapped, 5s timeout) → cache (in-memory, <2h old) → SSE message bus → empty with warning. All 8 test cases PASS.

---

## Verification Results

| Check | Result | Notes |
|-------|--------|-------|
| Test status | 8 pass, 0 fail | ✓ GREEN phase complete |
| Circuit breaker integration | ✓ Complete | Breakers.foreignFlow wraps primary fetch |
| Cache fallback | ✓ Implemented | In-memory lastSuccessCache, TTL enforcement |
| SSE fallback | ✓ Implemented | Optional message bus extraction with dedup |
| Error handling | ✓ Complete | Graceful degradation chain, no crashes |
| TypeScript | 0 errors | ✓ Full type safety with ForeignFlowFetchResult interface |
| Database integration | ✓ Verified | writeForeignFlowToOhlcv() called on primary success |
| Logging | ✓ Complete | Telemetry for fallback activation, recovery, failures |
| Staleness guards | ✓ Integrated | Works with freshnessSlaChecker post-fetch (Sprint 1282) |

---

## Test Coverage

| Test Case | Status | Lines | Notes |
|-----------|--------|-------|-------|
| 1. Primary timeout → fallback activates | PASS | 196 | Timeout >5s triggers cache/SSE path |
| 2. Fallback returns cached data | PASS | 216 | Returns { changes, timestamp, source='cache' } |
| 3. Circuit breaker opens on 5+ failures | PASS | 263 | State + failure count verified |
| 4. Open circuit skips primary | PASS | 305 | Proceeds directly to cache/SSE |
| 5. SSE fallback | PASS | 370 | Message bus extraction with dedup |
| 6. All fallbacks unavailable | PASS | 415 | Returns source='none' with warning |
| 7. Staleness guard (>2h cache) | PASS | 485 | SLA checker integration verified |
| 8. Primary recovery (circuit close) | PASS | 528 | Circuit closed, primary used next fetch |

---

## Implementation Details

### File: `/src/infrastructure/fetchers/foreignFlowFetcher.ts` (373 lines)

**Exports:**
- `ForeignFlowFetchResult` interface
- `fetchForeignFlowWithFallback()` function
- `CacheStore` interface (test injection)
- `MessageBus` interface (test injection)

**Key functions:**
1. **fetchPrimaryVpsEndpoint()** — Calls VPS endpoint at port 5005, parses JSON, validates WriteForeignFlowItem schema
2. **extractFromSSE()** — Parses recent SSE messages, deduplicates by (code, date), returns array
3. **getFallbackFromCache()** — Returns lastSuccessCache if <2h old, empty array if stale
4. **gracefulDegradation()** — Primary → cache → SSE → none (in that order)

**Circuit breaker policy:**
- Failure threshold: 5 consecutive errors
- Half-open timeout: 30 seconds
- State transitions tested in case 3, 4, 8

**Cache policy:**
- Storage: Module-level `lastSuccessCache` (persists across calls)
- TTL: 2 hours (enforced on retrieval)
- Timestamp precision: ISO 8601 (matches SLA checker expectations)

**Fallback chain:**
1. Primary (wrapped in circuit breaker, 5s timeout)
2. Cache (if <2h old)
3. SSE message bus (if available)
4. None (return empty result + warning)

---

## Schema & Data Contracts

**Input:** None (fetches from external VPS endpoint + internal caches)

**Output:** `ForeignFlowFetchResult`
```typescript
{
  changes: number;           // rows updated in daily_ohlcv
  timestamp: string;         // ISO 8601, when fetch completed
  source: 'primary'|'cache'|'sse'|'none';
  warning?: string;          // "all fallbacks unavailable" or staleness note
}
```

**Integration points:**
- ✓ circuitBreakerRegistry (breakers.foreignFlow)
- ✓ ohlcvForeignFlowStore (writeForeignFlowToOhlcv)
- ✓ freshnessSlaChecker (post-fetch validation, Sprint 1282)

---

## Edge Cases Handled

1. **Concurrent calls:** Atomic via circuit breaker
2. **Cache corruption:** Fallback to SSE/none (never crash)
3. **Stale cache + stale SSE:** Use whichever is less stale; alert if both >2h old
4. **Empty results:** source='none' with warning, doesn't block scheduler
5. **Primary recovery:** Circuit transitions to half-open → closed on successful fetch
6. **SSE dedup:** By (code, date) tuple to prevent duplicate inserts

---

## Files Modified

- `src/infrastructure/fetchers/foreignFlowFetcher.ts` (NEW, 373 lines)
  - Lines 1-77: Types + module state
  - Lines 91-373: Implementation (fetchPrimaryVpsEndpoint, extractFromSSE, gracefulDegradation, main export)

---

## Dependencies

✓ circuitBreakerRegistry.ts (breakers.foreignFlow)
✓ ohlcvForeignFlowStore.ts (writeForeignFlowToOhlcv, WriteForeignFlowItem)
✓ logger.ts (telemetry)
✓ freshnessSlaChecker.ts (post-fetch validation, Sprint 1282)
✓ messagebus interface (optional, for SSE fallback)

---

## QA Sign-Off

**Verdict:** APPROVED

All acceptance criteria met:
- ✓ All 8 test cases PASS (GREEN phase complete)
- ✓ Implementation matches TASK_1288b.md specification
- ✓ Circuit breaker integration verified
- ✓ Graceful degradation chain working (primary → cache → SSE → none)
- ✓ Cache TTL enforcement tested (>2h old flagged)
- ✓ Recovery logic tested (circuit closes when primary comes back)
- ✓ Error handling complete (no unhandled promises)
- ✓ Type safety verified (0 TypeScript errors)
- ✓ Logging complete (all fallback paths telemetry enabled)

**Blocking issues:** None

**Non-blocking findings:**
- Next sprint (1289): Integrate fetcher into `pollForeignFlowJob` scheduler
- Next sprint (1289): Add retry logic for half-open circuit tests

**Ready for:** Merge to main after PO final sign-off

---

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
