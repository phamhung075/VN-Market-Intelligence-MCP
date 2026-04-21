# Task Context — 239b: Diagnosis + GREEN — macroIndicatorFetcher.ts + macroIndicatorRefreshJob.ts

## TLDR (read this first)

change: `src/domain/services/macro/macroIndicatorFetcher.ts` (NEW) + `src/scheduler/macro/macroIndicatorRefreshJob.ts` (NEW)
test: src/__tests__/239-macro-indicator-refresh.test.ts — 10 assertions now pass (GREEN phase)
branch: task/239b-macro-refresh-green

depends: 239a ✓ (test framework in place)
knowledge_needed: [bundle-developer, portfolio-schema]

---

sprint: 239
branch: task/239b-macro-refresh-green
status: todo (wait for 239a merge)
req_ref: (BA pending)
tech_ref: TECH-239

---

## [PM] Planning Context

layer: domain + scheduler
depends_on: 239a ✓ (RED test framework complete)

files_to_read:
- docs/TECH_239.md (lines 52–91) → interface contracts + fallback chain logic
- src/domain/services/freshnessSlaChecker.ts → SLA validation pattern
- src/domain/services/rateLimiter.ts → rate limiter API
- src/infrastructure/circuitBreakerRegistry.ts → circuit breaker wrapper
- src/infrastructure/db/schema-macro.ts → macro_indicators table structure (existing)
- src/interface/mcp/server.ts → VPS endpoints (/api/push-sbv, /api/push-gso) already exist
- src/scheduler/alert.ts or similar → alert escalation pattern to WORK channel

files_to_create:
- /abs/path/to/src/domain/services/macro/macroIndicatorFetcher.ts (CREATE)
- /abs/path/to/src/scheduler/macro/macroIndicatorRefreshJob.ts (CREATE)

files_to_modify:
- src/domain/services/macro/index.ts (barrel export — CREATE if missing)
- src/scheduler/macro/index.ts (barrel export — CREATE if missing)

test_file: src/__tests__/239-macro-indicator-refresh.test.ts

acceptance_criteria:

**Given** the test framework from 239a with 10 failing assertions
**When** macroIndicatorFetcher.ts + macroIndicatorRefreshJob.ts are implemented

**AC-1 to AC-10:** All 10 assertions from 239a now PASS
  - Yahoo success: 3 indicators stored with timestamps
  - Fallback chain works (yahoo timeout → sbv, sbv 401 → gso)
  - All sources fail: returns success=false, sourceUsed=null
  - SLA check: passes on fresh data (age ≤ 24h), fails on stale (age > 24h)
  - last_refresh_job column persists source + count
  - Circuit breaker wraps all HTTP calls
  - Rate limiter called for quota management
  - Stale-data alert on startup includes age in hours

---

## Implementation Details

### 1. macroIndicatorFetcher.ts (domain service)

**Location:** `src/domain/services/macro/macroIndicatorFetcher.ts`

**Exports:**
```typescript
export async function fetchAndStoreMacroIndicators(): Promise<FetchResult>;

export interface FetchResult {
  success: boolean;
  sourceUsed: "yahoo" | "sbv" | "gso" | null;
  indicatorCount: number;
  fetchedAt: string;
  error?: string;
}
```

**Fallback chain logic:**
1. Try Yahoo Finance: GET `https://finance.yahoo.com/quote/^VIX/` (or alternative macro page)
   - Parse HTML: extract CPI, GDP, interest_rate, unemployment, inflation, trade balance, current account, govt debt, budget deficit, manufacturing PMI, consumer confidence, retail sales
   - Timeout: 5 seconds
   - On success: return immediately with sourceUsed="yahoo"
   - On 504/timeout/parse error: continue to SBV

2. Try SBV (State Bank of Vietnam):
   - POST to VPS endpoint `/api/push-sbv` with auth header
   - Timeout: 5 seconds
   - On 401/500/timeout: continue to GSO
   - On success: return sourceUsed="sbv"

3. Try GSO (General Statistics Office):
   - POST to VPS endpoint `/api/push-gso`
   - Timeout: 5 seconds
   - On any failure: continue to final fallback

4. If all fail: return { success: false, sourceUsed: null, indicatorCount: 0 }

**Required integrations:**
- Circuit breaker: wrap each HTTP fetch with `circuitBreakerRegistry.wrap()`
- Rate limiter: call `rateLimiter.checkLimit()` before each source attempt
- Database: use SQLite INSERT OR REPLACE into macro_indicators + update last_refresh_job column
- SLA checker: after store, call `checkDataFreshnessSla("macro", 24 * 60)` (24h window)
- Escalation: if SLA fails, send alert to WORK channel: `send_telegram(channel="work", message="Macro data [N hours] stale — refresh failed")`

**Error handling:**
- Never throw on HTTP errors — always fallback
- Log each attempt (timeout, status code, parse error) for debugging
- Return structured result with error field for caller inspection

### 2. macroIndicatorRefreshJob.ts (scheduler)

**Location:** `src/scheduler/macro/macroIndicatorRefreshJob.ts`

**Exports:**
```typescript
export async function macroIndicatorRefreshJob(): Promise<void>;
export async function validateMacroFreshnessOnStartup(): Promise<void>;
```

**Job behavior:**
- Runs daily at 06:00 GMT+7 (before morning briefing at 08:00)
- Call `fetchAndStoreMacroIndicators()`
- Log result to WORK channel: e.g., "Macro refresh: yahoo (3 cols) at 2026-04-21T06:05:12Z"
- If result.success=false: append escalation note: "All sources failed — check VPS health"
- If data post-refresh is stale (age > 24h): append SLA alert
- Handle database busy (WAL checkpoint): retry 3 times with 100ms backoff before failing

**Startup validation:**
- On scheduler startup, check if macro_indicators data is stale (age > 24h)
- If stale, send WORK alert: "Macro data STALE [30 days old] — manual intervention needed"
- Do NOT auto-correct stale data; only alert

**Key implementation notes:**
- Use `Bun.env` for secrets (VPS_PUSH_API_KEY)
- Parameterized SQL: INSERT OR REPLACE uses ? placeholders
- Timestamp: use ISO 8601 format (e.g., "2026-04-21T06:05:12Z")
- last_refresh_job format: "2026-04-21T06:05:12Z — yahoo (3 cols)" on success or "2026-04-21T06:05:12Z — all-failed (0 cols)" on failure
- Single row per country (macro_indicators has UNIQUE constraint on 'VN')

---

## Barrel Exports (Create if missing)

**src/domain/services/macro/index.ts:**
```typescript
export { fetchAndStoreMacroIndicators, type FetchResult } from "./macroIndicatorFetcher.js";
```

**src/scheduler/macro/index.ts:**
```typescript
export { macroIndicatorRefreshJob, validateMacroFreshnessOnStartup } from "./macroIndicatorRefreshJob.js";
```

---

## Testing Strategy

- All 10 test cases from 239a now pass (GREEN phase)
- Use Bun's test runner: `bun test 239-macro-indicator-refresh.test.ts`
- Verify: 10 PASS, 0 FAIL
- Type check: `bun tsc --noEmit` shows 0 errors
- No test modifications needed for 239b — implementation must match test expectations

---

## Acceptance Criteria (for merge)

- Files created: `src/domain/services/macro/macroIndicatorFetcher.ts` + `src/scheduler/macro/macroIndicatorRefreshJob.ts`
- Barrel exports: `src/domain/services/macro/index.ts` + `src/scheduler/macro/index.ts`
- All 10 test cases PASS: `bun test 239-macro-indicator-refresh.test.ts` → 10 PASS, 0 FAIL
- Type check: `bun tsc --noEmit` shows 0 errors
- No circular imports (domain never imports scheduler)
- Branch: `task/239b-macro-refresh-green`
- Ready for 239c (integration + schema update)

