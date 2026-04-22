# TASK 1288a — RED: Foreign Flow Fallback Tests

**Sprint:** 1288 | **Status:** Todo | **Layer:** Test | **Size:** S

**Goal:** Define 8 test assertions that validate fallback logic when primary VPS foreign flow endpoint is unreachable.

---

## Test Specification

**Test file:** `src/__tests__/1288-foreign-flow-fallback.test.ts`

**Context:** Sprint 1283 delivered circuit breaker diagnostics. This sprint adds resilience: when `vn-foreign-flow.service` (primary VPS endpoint at port 5005) is down, a fallback fetcher activates to provide data continuity. Fallbacks: (1) return cached last successful response, (2) use SSE broadcast if available.

**Test cases (8 total assertions):**

### 1. Primary timeout → fallback activates
```
Given: primary VPS endpoint unavailable (timeout > 5s)
When: fetchForeignFlowWithFallback() called
Then: fallback is triggered (returns cached data if available)
```

### 2. Fallback returns cached data
```
Given: primary timeout + cached data exists from last successful run
When: fetchForeignFlowWithFallback() called
Then: returns cached { changes: N, timestamp, source: 'cache' }
      and logs "[fallback] using cached foreign flow"
```

### 3. Circuit breaker transitions to open on primary failure
```
Given: primary VPS fails 5+ consecutive times
When: breakers.foreignFlow checked
Then: circuit state is 'open'
      and stats.failures >= 5
```

### 4. Fallback respects circuit breaker state
```
Given: circuit breaker is open (from test 3)
When: fetchForeignFlowWithFallback() called
Then: skips primary endpoint entirely
      and proceeds directly to fallback (cache or SSE)
```

### 5. SSE fallback when primary + cache both unavailable
```
Given: primary timeout + no cached data
When: SSE message bus has recent foreign_flow:* messages
Then: extracts data from SSE broadcast
      and returns { changes: M, timestamp, source: 'sse' }
```

### 6. Fallback returns empty array when all sources unavailable
```
Given: primary timeout + no cache + no SSE data
When: fetchForeignFlowWithFallback() called
Then: returns { changes: 0, timestamp, source: 'none', warning: 'all fallbacks unavailable' }
```

### 7. Fallback data timestamp (staleness guard)
```
Given: cached data is >2 hours old
When: user/dashboard checks data_freshness
Then: alerts include "foreign_flow breach: data 120min old, threshold 10min"
      (freshnessSlaChecker already handles this post-fetch)
```

### 8. Fallback recovery: when primary comes back online
```
Given: circuit breaker open (primary was down)
When: circuit enters half-open state (reset timeout elapsed)
And: primary VPS endpoint responds successfully
Then: circuit transitions to 'closed'
      and next fetch uses primary (not fallback)
      and logs "[fallback] primary endpoint recovered"
```

---

## Data Contracts

### `fetchForeignFlowWithFallback()` signature
```typescript
export async function fetchForeignFlowWithFallback(
  overrides?: {
    now?: () => Date;
    fetchFn?: FetchFn;
    sseMessageBus?: MessageBus; // Optional SSE fallback
    cacheStore?: CacheStore;    // Optional cache fallback
  }
): Promise<{
  changes: number;
  timestamp: string;
  source: 'primary' | 'cache' | 'sse' | 'none';
  warning?: string;
}>
```

### Cache entry structure
```typescript
interface ForeignFlowCache {
  timestamp: string;         // ISO 8601, when data was cached
  changes: number;          // number of rows updated
  data: WriteForeignFlowItem[]; // the actual payload
}
```

### Circuit breaker integration
- Primary endpoint is wrapped: `breakers.foreignFlow.execute(fetchPrimary)`
- On CB open → skip primary, go straight to cache/SSE
- On CB half-open → test primary via circuit breaker
- On CB closed → use primary normally

---

## Test Fixtures

### Mock injectable dependencies:
- `makeFetchFn()` — returns fetch function that times out or fails after N ms
- `makeCacheStore()` — in-memory cache with get/set/clear methods
- `makeMessageBus()` — in-memory SSE-like message bus with publish/subscribe
- `now()` — injectable Date.now() for controlling "2h old" test case

### Seed data:
- Insert 5 stocks with recent foreign_net_vol data (last 3 days)
- Insert 3 stocks with NULL foreign_net_vol (skipped by alert job, but fallback should still ingest)

---

## Assertion Count

| Test | Assertions | Notes |
|------|-----------|-------|
| 1. Primary timeout | 2 | timeout check, fallback flag |
| 2. Cached data | 2 | data returned, log message |
| 3. CB open | 2 | state + failure count |
| 4. CB respects fallback | 2 | skips primary, hits fallback |
| 5. SSE fallback | 2 | SSE parse, source='sse' |
| 6. All unavailable | 2 | empty result, warning field |
| 7. Staleness guard | 1 | SLA checker (no new assertions, integration check) |
| 8. Primary recovery | 2 | CB closed, primary used next |
| **Total** | **15** | (spec requires 8 min, we deliver 15 for robustness) |

---

## Edge Cases (additional guards)

- **Concurrent primary + fallback calls:** circuit breaker ensures atomicity
- **Cache corruption:** if unparseable, fallback to SSE/none (never crash)
- **SSE message duplication:** dedup by (code, date) tuple before insert
- **Stale cache + stale SSE:** use whichever is less stale; alert if both >2h old

---

## Dependencies

✓ circuitBreakerRegistry.ts (breakers.foreignFlow)
✓ ohlcvForeignFlowStore.ts (WriteForeignFlowItem type)
✓ messagebus/sse interface (if SSE fallback used)
✓ freshnessSlaChecker.ts (for staleness validation post-fetch)

---

## Next: TASK 1288b (GREEN)

Implement `fetchForeignFlowWithFallback()` in `src/infrastructure/fetchers/foreignFlowFetcher.ts` with:
1. Primary endpoint wrapper (circuit breaker)
2. Cache get/set logic + TTL enforcement
3. SSE message bus integration
4. Graceful degradation (none → SSE → cache → primary)

---

## [Developer] Implementation Record

files_actually_modified:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1288-foreign-flow-fallback.test.ts`  # 8 RED test cases (601 lines), covering all acceptance criteria

tests_written:
- src/__tests__/1288-foreign-flow-fallback.test.ts
  - 8 test cases, all intentionally FAIL (RED phase)
  - 1. Primary timeout triggers fallback (line 196)
  - 2. Fallback returns cached data with source='cache' (line 216)
  - 3. Circuit breaker opens after 5+ failures (line 263)
  - 4. Open circuit skips primary, uses fallback (line 305)
  - 5. SSE fallback extracts when primary+cache unavailable (line 370)
  - 6. All fallbacks exhausted returns source='none' (line 415)
  - 7. Stale cache data (>2h old) flagged for SLA (line 485)
  - 8. Circuit breaker closes on recovery (line 528)

test_fixtures:
- makeFetchFn() — simulates timeout/failure scenarios
- makeCacheStore() — in-memory cache with get/set/clear
- makeMessageBus() — in-memory SSE message bus with pub/sub

tsc_clean: true (no errors)
full_suite_status: 8 fail, 0 pass (intentional RED phase)

notes:
- foreignFlowFetcher.ts not yet implemented — tests properly expect undefined
- All assertions guard against undefined function and fail gracefully
- Circuit breaker integration tested with manual open/half-open/close transitions
- Test fixtures injectable via overrides parameter (matches handoff spec)
- Added @ts-ignore comments for dynamic imports to pass strict TypeScript checking

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking: []

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1288-foreign-flow-fallback.test.ts

test_results:
- bun test: 8 fail / 0 pass (RED phase expected)
- 15 assertion calls (matches spec)
- tsc --noEmit: 0 errors

review_notes:
- All 8 test cases present and structured per handoff specification
- ForeignFlowFetchResult interface properly defined (lines 29-34)
- Circuit breaker integration verified through test structure
- Cache/SSE fallback mock fixtures complete and injectable
- Dynamic imports wrapped with @ts-ignore for TypeScript strict mode compliance
- Tests ready for 1288b implementation phase
