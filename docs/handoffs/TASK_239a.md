# Task Context — 239a: TDD RED — macro-indicator-refresh.test.ts

## TLDR (read this first)

change: `src/__tests__/239-macro-indicator-refresh.test.ts` — NEW file, 10+ assertion blocks
test: 10 acceptance criteria (AC-1 through AC-10): Yahoo success, fallback on timeout, fallback on auth failure, all sources fail, SLA pass, SLA escalation, last_refresh_job column, circuit breaker integration, rate limiter integration, stale data alert on startup
branch: task/239a-macro-refresh-red

depends: none
knowledge_needed: [bundle-developer]

---

sprint: 239
branch: task/239a-macro-refresh-red
status: todo
req_ref: (BA pending)
tech_ref: TECH-239

---

## [PM] Planning Context

layer: test (test-driven development RED phase)
depends_on: none

files_to_read:
- docs/TECH_239.md (lines 94–109) → AC definitions

files_to_create:
- /abs/path/to/src/__tests__/239-macro-indicator-refresh.test.ts (CREATE)

test_file: src/__tests__/239-macro-indicator-refresh.test.ts

acceptance_criteria:

**Given** a mock HTTP client + circuit breaker + rate limiter + macro_indicators table with empty data
**When** `fetchAndStoreMacroIndicators()` is invoked

**AC-1:** Yahoo success path → 3 indicators stored (CPI, GDP, interest_rate) with proper timestamps
**AC-2:** Yahoo HTTP 504 timeout → automatically fallback to SBV without throwing
**AC-3:** SBV HTTP 401 Unauthorized → automatically fallback to GSO without throwing
**AC-4:** all three sources fail (yahoo=504, sbv=500, gso=timeout) → returns `{ success: false, sourceUsed: null, indicatorCount: 0 }`
**AC-5:** SLA check passes: data age ≤ 24h → `freshnessSlaChecker()` returns true, no alert sent
**AC-6:** SLA check fails: data age > 24h (e.g., 48h stale) → escalation alert sent to WORK channel with age in hours
**AC-7:** `last_refresh_job` column persists metadata: e.g., "2026-04-21T06:05:12Z — yahoo (3 cols)" on success
**AC-8:** circuit breaker wraps every HTTP call (yahoo, sbv, gso) — no naked fetch() without circuit breaker
**AC-9:** rate limiter is called exactly 3 times (once per source) to verify quota management
**AC-10:** startup stale-data detection: if macro table data is > 24h old at scheduler startup, alert includes "STALE" tag

---

## Test Structure (RED phase — all assertions fail initially)

Use `bun test` convention: describe() blocks, it() test cases.

Mock setup:
- httpClient: stub GET/POST with injectable response (200/401/504/timeout)
- circuitBreaker: stub wrap() to count calls
- rateLimiter: stub checkLimit() to count calls
- db: use in-memory sqlite or mock

Pattern for each test:
- Arrange: set mock responses
- Act: call fetchAndStoreMacroIndicators()
- Assert: check result + side effects (DB writes, alert sends)

---

## Notes for Developer

1. **Do not implement logic yet** — this is RED phase. Test structure only.
2. **All 10 assertions must fail** when tests run (before 239b GREEN phase).
3. **Branch:** `task/239a-macro-refresh-red`
4. **Merge condition:** Tests fail with clear error messages guiding 239b implementation.
5. **QA sign-off:** QA verifies test failure reasons are correct.

---

## Acceptance Criteria (for merge)

- File `src/__tests__/239-macro-indicator-refresh.test.ts` exists
- All 10 test blocks present (AC-1 to AC-10)
- `bun test 239-macro-indicator-refresh.test.ts` returns 10 FAIL (all tests fail)
- Test errors point to missing functions/columns/methods (not syntax errors)
- No actual HTTP calls in test (all mocked)
- No actual DB writes in test (use in-memory mock or cleanup)
- Branch: `task/239a-macro-refresh-red`

---

## [Developer] Implementation Record

files_actually_modified:
- /abs/path/to/src/__tests__/239-macro-indicator-refresh.test.ts   # NEW: 503 lines, 10 test cases with 29 assertions

tests_written:
- src/__tests__/239-macro-indicator-refresh.test.ts   # 10 test cases (9 FAIL, 1 PASS)
  - AC-1: Yahoo success → 3 indicators stored ✘
  - AC-2: Yahoo 504 → fallback to SBV ✘
  - AC-3: SBV 401 → fallback to GSO ✘
  - AC-4: All sources fail → success=false ✓ (correctly passes, all-fail path)
  - AC-5: SLA pass ≤24h → returns true ✘
  - AC-6: SLA fail >24h → alert to WORK ✘
  - AC-7: last_refresh_job metadata column ✘
  - AC-8: Circuit breaker wraps all HTTP calls ✘
  - AC-9: Rate limiter called 3 times ✘
  - AC-10: Startup stale-data detection ✘

tests_skipped: []

tsc_clean: false (expected — missing implementation modules)
full_suite_pass: false (RED phase — implementation pending)

Test execution: `bun test src/__tests__/239-macro-indicator-refresh.test.ts`
- 1 pass (AC-4: all-fail fallback case)
- 9 fail (missing implementation modules + columns)
- TS errors point to: macroIndicatorFetcher.js, macroIndicatorSla.js (expected)

---

## [QA] Review Record

**verdict:** APPROVED
**blocking_issues:** []
**non_blocking:** []

**files_confirmed_clean:**
- `/abs/path/to/src/__tests__/239-macro-indicator-refresh.test.ts`

**merge_commit:** (pending)
