# TASK REPORT 1330a — RED Phase: Triage 7 Failing Tests

**Date:** 2026-04-25
**Branch:** task/1330a-triage-failing-tests-red
**Phase:** RED (diagnosis only — no implementation changes)
**Full suite result:** 6927 pass, 7 fail

---

## Summary

All 7 failures confirmed by running tests in isolation and in the full suite.
Findings deviate from the handoff in two ways:

1. **Group A filename corrected:** The failing `result?.fallback` assertions are in
   `1294b-bctc-fallback.test.ts`, NOT `1289c-fetcher-validator-integration.test.ts`
   (1289c passes 6/6 in isolation AND in the full suite — no issue there).

2. **Group D root cause corrected:** `1319-watchdog-foreign-flow.test.ts` fails in
   isolation (logic bug in implementation, NOT a module-state leak), while
   `1551-pipeline-watchdog-market-alert.test.ts` passes 3/3 in isolation
   (it IS a module-state leak that only manifests in the full suite).

---

## Group A — `1294b-bctc-fallback.test.ts` (3 failures)

**File:** `apps/mcp-server/src/__tests__/1294b-bctc-fallback.test.ts`
**Lines:** 178, 252, 297
**Isolation result:** 5 pass, 3 fail (CONFIRMED fails in isolation)

### Contract mismatch

Tests check `result?.fallback` (field does not exist on the return type of
`fetchParseAndStoreBctc`). The actual return type has no `fallback` boolean field,
so the expression always resolves to `undefined`.

```
// Line 178:
expect(result?.fallback).toBe(false);   // Expected: false, Received: undefined
// Line 252:
expect(result?.fallback).toBe(false);   // Expected: false, Received: undefined
// Line 297:
expect(result?.fallback).toBe(false);   // Expected: false, Received: undefined
```

The `result?.reason` assertions on lines 179, 253, 298 also fail as side-effects
(if `fallback` is undefined, the function returned early or without the expected
shape, meaning `reason` is also absent). However the primary assertion failure
is on `fallback`.

**Fix strategy (for 1330b):**
Option A (preferred): The `fetchParseAndStoreBctc` return type needs a `fallback`
boolean field added to its return value when the news-chain fallback path is
taken (or explicitly skipped). Align implementation to the test contract.
Option B: Remove the `fallback` assertions and rely only on `reason` field checks
and DB row-count assertions that already exist in each test.
Recommendation: confirm with Architect which field the implementation should expose.

**Note:** The file also triggers a Bun C++ panic after the 3 failing tests complete
(crash during coverage collection on pdf-parse/OCR-related modules). This is a
Bun 1.3.11 runtime bug, not a test logic error. The 3 failures are real and
independent of the crash.

---

## Group B — `1476-wal-stuck-alert.test.ts` (2 failures)

**File:** `apps/mcp-server/src/__tests__/1476-wal-stuck-alert.test.ts`
**Lines:** 39, 47
**Isolation result:** 2 pass, 2 fail (CONFIRMED fails in isolation)

### Failure 1 — message prefix mismatch (line 39)

Sprint 1329 changed `walCheckpointAlert.ts` to use `"WAL CRITICAL:"` prefix.
Test still checks for old prefix `"WAL stuck"`.

```
// Test assertion:
expect(sendWorkCalls[0]).toContain("WAL stuck");

// Actual message produced:
"WAL CRITICAL: 60000 frames un-flushed (WAL=80000, checkpointed=20000) — manual restart may be needed"
```

### Failure 2 — threshold boundary mismatch (line 47)

Sprint 1329 changed `WAL_WARN_THRESHOLD` from 50000 to 5000 frames.
Test was written for the old 50000 threshold. It sets `remaining = 50000`
and expects NO alert (`toHaveLength(0)`), but with threshold now 5000,
`remaining 50000 > 5000` fires the alert.

```
// Test sets up: walSize=70000, checkpointed=20000 → remaining=50000
// Test expects: sendWorkCalls.length === 0  (i.e. no alert)
// Actual:       alert fires (50000 > WAL_WARN_THRESHOLD=5000)
```

**Fix strategy (for 1330b — Option A, confirmed preferred):**
- Line 39: change `"WAL stuck"` to `"WAL CRITICAL"`.
- Line 47: adjust boundary test. Use `remaining = 5000` (walSize=25000,
  checkpointed=20000) to hit the at-threshold no-alert case, OR reframe
  test as "does NOT fire when remaining < 5000" with walSize=24999.

---

## Group C — `240-price-pipeline-recovery.test.ts` AC-4 (1 failure)

**File:** `apps/mcp-server/src/__tests__/240-price-pipeline-recovery.test.ts`
**Line:** 174
**Isolation result:** 13 pass, 0 fail (passes alone)
**Full-suite result:** FAILS with `result = "cooldown"` instead of `"alert-sent"` or `"restart"`

### Module state leak — cooldown bleeds from prior test

AC-4 (line 155) does not call `_resetWatchdogCooldown()` before invoking
`priceUpdateWatchdog`. When the full suite runs, a prior test in the same file
(AC-5 or AC-6) sets `lastAlertAt` to a non-zero value. AC-4 then hits the
cooldown guard and returns `"cooldown"`, which is not in the expected array
`["alert-sent", "restart"]`.

The assertion at line 174 is:
```typescript
expect(["alert-sent", "restart"]).toContain(result);
// When result = "cooldown" (cooldown state leaked) → FAIL
```

Compare with AC-5 (line 191) which correctly calls `_resetWatchdogCooldown?.()`.

Note: test execution order in the full suite likely places another file (e.g.
`1551-pipeline-watchdog-market-alert.test.ts`) before `240-*`, and that file's
`pipelineWatchdogJob` shares the `priceUpdateWatchdog` module instance.

**Fix strategy (for 1330b):** Add `_resetWatchdogCooldown?.()` call at the start
of the AC-4 test body, matching the pattern used in AC-5.

---

## Group D (corrected) — `1319-watchdog-foreign-flow.test.ts` (1 failure)

**File:** `apps/mcp-server/src/__tests__/1319-watchdog-foreign-flow.test.ts`
**Line:** 37
**Isolation result:** 6 pass, 1 fail (CONFIRMED fails in isolation — logic bug, NOT module leak)

### Implementation logic bug — null treated as fresh

Test 1 passes `readForeignFlow: () => null` (simulating never-written table) and
expects `result === "alert-sent"`. However the implementation in
`vpsProxyWatchdogJob.ts` line 203-204 explicitly treats `null` as fresh data:

```typescript
// src/scheduler/vpsProxyWatchdogJob.ts, line 203-204:
// null = service has never written data (e.g. fresh deploy or test DB) — treat as fresh, not stale
const foreignFlowAgeMs = latestForeignFlow ? now.getTime() - latestForeignFlow.getTime() : 0;
```

This means `foreignFlowAgeMs = 0` when `latestForeignFlow = null`, so the
`>= FOREIGN_FLOW_STALE_MS` check never fires, and the function returns `"ok"`
instead of `"alert-sent"`.

**Contract conflict:** The test spec says null (never-written) should fire an
alert (foreign-flow service hasn't written anything = service down). The
implementation says null = fresh deploy, skip alert.

**Fix strategy (for 1330b):** Architect must decide the correct contract:
- Option A (align implementation to test): treat `null` as stale (service never
  wrote = treat as infinite age). Change line 204 to use `Infinity` or max age
  when `latestForeignFlow === null`.
- Option B (align test to implementation): change test 1 to use a very old
  timestamp instead of `null`, accepting that null = "fresh deploy" is correct.

---

## Group D (original handoff) — `1551-pipeline-watchdog-market-alert.test.ts` (0 failures in isolation)

**File:** `apps/mcp-server/src/__tests__/1551-pipeline-watchdog-market-alert.test.ts`
**Isolation result:** 3 pass, 0 fail
**Full suite result:** NOT failing in full suite (excluded from the 7 failures)

This test is NOT one of the 7 failures. The handoff's Group D diagnosis was
incorrect for the current codebase state. The 7th failure belongs to `1319`.

---

## Confirmed Failure Map (for 1330b)

| # | File | Line(s) | Type | Fails in isolation? | Root cause |
|---|------|---------|------|---------------------|------------|
| 1 | `1294b-bctc-fallback.test.ts` | 178 | Contract | Yes | `result?.fallback` field missing from return type |
| 2 | `1294b-bctc-fallback.test.ts` | 252 | Contract | Yes | `result?.fallback` field missing from return type |
| 3 | `1294b-bctc-fallback.test.ts` | 297 | Contract | Yes | `result?.fallback` field missing from return type |
| 4 | `1476-wal-stuck-alert.test.ts` | 39 | Stale test | Yes | Old message prefix `"WAL stuck"` vs new `"WAL CRITICAL"` |
| 5 | `1476-wal-stuck-alert.test.ts` | 47 | Stale test | Yes | Old threshold 50000 vs new `WAL_WARN_THRESHOLD=5000` |
| 6 | `240-price-pipeline-recovery.test.ts` | 174 | State leak | No (full suite only) | AC-4 missing `_resetWatchdogCooldown()` call |
| 7 | `1319-watchdog-foreign-flow.test.ts` | 37 | Logic bug | Yes | `null` reader treated as fresh (age=0) instead of stale |

---

## Acceptance Criteria Status

- [x] All 7 root causes documented and confirmed by running individual tests
- [x] No implementation files modified
- [ ] Architect sign-off before 1330b begins
