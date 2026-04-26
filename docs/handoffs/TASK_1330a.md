# TASK 1330a — RED Phase: Document Failing Test Contract Mismatches

**Sprint:** 1330
**Phase:** RED (document + verify failures before fixing)
**Size:** XS (1h)
**Layer:** `src/__tests__/` — test files only, no implementation changes
**Owner:** Developer

---

## Objective

Confirm and document the exact contract mismatch for each of the 7 failing tests. No implementation changes in this task. Output is a confirmed failure map that 1330b uses to make targeted fixes.

---

## Failing Tests — Confirmed Root Causes

### Group A: `1289c-fetcher-validator-integration.test.ts` (3 failures)

**File:** `apps/mcp-server/src/__tests__/1289c-fetcher-validator-integration.test.ts`
**Lines:** 178, 252, 297

**Contract mismatch:**
The tests check `result?.fallback` (a field that does not exist on `ForeignFlowFetchResult`). The actual discriminant field is `source: "primary" | "cache" | "sse" | "none"`.

```
expect(result?.fallback).toBe(false)   // WRONG — always undefined
```

The tests at lines 162, 197, 240 already use the correct `result.source` assertions. Only the extra `result?.fallback` assertions at 178, 252, 297 are broken.

**Fix strategy (for 1330b):** Remove the 3 `expect(result?.fallback).toBe(false)` assertions. The `source !== "primary"` assertions already cover the intent. No implementation change needed.

---

### Group B: `1476-wal-stuck-alert.test.ts` (2 failures)

**File:** `apps/mcp-server/src/__tests__/1476-wal-stuck-alert.test.ts`
**Lines:** 39, 47

**Sprint 1329 changed `walCheckpointAlert.ts` message format and thresholds. Tests were NOT updated.**

Failure 1 (line 39):
```
expect(sendWorkCalls[0]).toContain("WAL stuck")
// Actual message: "WAL CRITICAL: 60000 frames un-flushed (WAL=80000, checkpointed=20000) — manual restart may be needed"
```
Current code uses prefix `"WAL CRITICAL"` not `"WAL stuck"`.

Failure 2 (line 47):
```
// Test: remaining = 70000-20000 = 50000 → expects NO call (threshold = 50000)
expect(sendWorkCalls).toHaveLength(0)
// Actual: threshold is WAL_WARN_THRESHOLD = 5000, so 50000 > 5000 → call fires
```

**Fix strategy (for 1330b):**
- Option A (preferred): Update test to match current message format — change `"WAL stuck"` to `"WAL CRITICAL"` and adjust boundary test to use `remaining = 5000` (not 50000).
- Option B: Change `walCheckpointAlert.ts` message prefix back to include `"WAL stuck"` text. Risks: breaks 1329 design intent, needs re-review.

**Recommendation: Option A** — update tests, preserve Sprint 1329 implementation.

---

### Group C: `240-price-pipeline-recovery.test.ts` AC-4 (1 failure)

**File:** `apps/mcp-server/src/__tests__/240-price-pipeline-recovery.test.ts`
**Line:** 174

**Test isolation bug.** AC-4 at line 155 does not call `_resetWatchdogCooldown()` before calling `priceUpdateWatchdog`. If any prior test in the same file (or from another file, via shared module state) set `lastAlertAt`, this test will hit the cooldown path and return `"cooldown"` instead of `"alert-sent"` or `"restart"`.

```
// Missing:
const { priceUpdateWatchdog, _resetWatchdogCooldown } = await import(...)
_resetWatchdogCooldown()    // ← this call is absent from AC-4
```

Compare to AC-5 at line 191 which correctly calls `_resetWatchdogCooldown?.()`.

**Fix strategy (for 1330b):** Add `_resetWatchdogCooldown?.()` call at the top of AC-4 test body, matching the pattern AC-5 uses.

---

### Group D: `1551-pipeline-watchdog-market-alert.test.ts` (1 failure)

**File:** `apps/mcp-server/src/__tests__/1551-pipeline-watchdog-market-alert.test.ts`
**Line:** 37 — `expect(result).toBe("alert-sent")` received `"ok"`

**Cross-file module state leak.** Test file 1550 (`vpsProxyWatchdogJob`) runs before 1551 (`pipelineWatchdogJob`). Both use module-level `lastAlertAt` state in their respective scheduler files. However the `pipelineWatchdogJob` module-level `lastAlertAt` may be non-zero from a prior test run in the same Bun worker process.

The `beforeEach` in 1551 calls `_resetWatchdogCooldown()` which resets `lastAlertAt = 0` — this should fix the cooldown issue. But the result is `"ok"` not `"cooldown"`, which means `staleMins <= STALE_THRESHOLD_MINS` is evaluating as true.

**Hypothesis:** Another test file that imports `pipelineWatchdogJob` and uses a mock with `staleMins = 0` or a low value may be executing concurrently (Bun parallel test workers share module instances). The `STALE_THRESHOLD_MINS = 90` is a constant so cannot be mutated. But `health.ragRows.staleMins` comes from the injected `getPipelineHealthFn`. The test correctly injects `makeHealth(STALE_MINS)` where `STALE_MINS = 100`.

**Deeper investigation needed for 1330b:** Add explicit logging or a sentinel assertion before the main check to confirm `staleMins` value at runtime. If the issue is Bun worker isolation, add `// @bun-test-isolation` hint or ensure `_resetWatchdogCooldown` resets ALL module state (not just `lastAlertAt`).

**Current `_resetWatchdogCooldown`:** only resets `lastAlertAt = 0`. No other module state in `pipelineWatchdogJob.ts` is visible that would cause `"ok"` return. The root cause needs confirmation during 1330b.

---

## Acceptance Criteria (1330a complete when)

- [ ] All 4 root causes documented above confirmed by running individual tests
- [ ] No implementation files modified
- [ ] This TASK_1330a.md signed off by Architect before 1330b begins

---

## Run individual tests to confirm

```bash
cd apps/mcp-server

# Group A: confirm 3 failures
bun test src/__tests__/1289c-fetcher-validator-integration.test.ts 2>&1 | tail -10

# Group B: confirm 2 failures
bun test src/__tests__/1476-wal-stuck-alert.test.ts 2>&1 | tail -10

# Group C: confirm 1 failure
bun test src/__tests__/240-price-pipeline-recovery.test.ts 2>&1 | grep -E "fail|pass"

# Group D: confirm 1 failure
bun test src/__tests__/1551-pipeline-watchdog-market-alert.test.ts 2>&1 | tail -10
```
