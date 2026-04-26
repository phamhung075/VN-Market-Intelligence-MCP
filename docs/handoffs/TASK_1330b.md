# TASK 1330b — GREEN Phase: Fix 7 Failing Tests

**Sprint:** 1330
**Phase:** GREEN (fix blocking regressions and isolation bugs)
**Size:** S (2-3h)
**Layer:** `src/__tests__/` (primary) + `src/scheduler/walCheckpointAlert.ts` (secondary, if Option B chosen)
**Owner:** Developer
**Depends on:** TASK_1330a (root cause confirmation)

---

## Objective

Fix all 7 failing tests. Do NOT change production logic unless a test failure reveals a genuine production bug. Prefer updating tests to match Sprint 1329 implementation decisions (Option A for Group B).

---

## Fix Plan

### Fix A: Remove 3 stale `result?.fallback` assertions in 1289c

**File:** `apps/mcp-server/src/__tests__/1289c-fetcher-validator-integration.test.ts`
**Lines to remove:** 178, 252, 297 (the `expect(result?.fallback).toBe(false)` calls)

These assertions check a field (`fallback`) that was never part of `ForeignFlowFetchResult`. The existing `result.source` assertions at lines 134-136, 161-163, 197-198 already fully cover the test intent.

```typescript
// REMOVE these lines (3 places):
expect(result?.fallback).toBe(false);
```

No replacement needed — the adjacent `source` assertions are sufficient.

**Verify:** `bun test src/__tests__/1289c-fetcher-validator-integration.test.ts` → 0 fail

---

### Fix B: Update 2 stale `walCheckpointAlert` assertions in 1476

**File:** `apps/mcp-server/src/__tests__/1476-wal-stuck-alert.test.ts`

**Fix B1 (line 39) — message text:**
```typescript
// BEFORE (wrong):
expect(sendWorkCalls[0]).toContain("WAL stuck");

// AFTER (matches current walCheckpointAlert.ts prefix):
expect(sendWorkCalls[0]).toContain("WAL CRITICAL");
```

**Fix B2 (line 43-48) — boundary test:**
The test comment says `remaining = 50000` should NOT trigger an alert. But `WAL_WARN_THRESHOLD = 5_000` in the implementation. The test was written for an old threshold.

```typescript
// BEFORE (wrong threshold):
it("does NOT call sendWork when remaining = 50000 (boundary, not over)", async () => {
  // remaining = 70000 - 20000 = 50000
  await walCheckpointAlert({ walSize: 70000, checkpointed: 20000 }, sendWorkFn);
  expect(sendWorkCalls).toHaveLength(0);
});

// AFTER (correct boundary at WAL_WARN_THRESHOLD = 5000):
it("does NOT call sendWork when remaining = 5000 (boundary, not over)", async () => {
  // remaining = 10000 - 5000 = 5000 (equal to threshold — NOT over)
  await walCheckpointAlert({ walSize: 10000, checkpointed: 5000 }, sendWorkFn);
  expect(sendWorkCalls).toHaveLength(0);
});
```

**Verify:** `bun test src/__tests__/1476-wal-stuck-alert.test.ts` → 0 fail

---

### Fix C: Add missing cooldown reset in AC-4 of 240

**File:** `apps/mcp-server/src/__tests__/240-price-pipeline-recovery.test.ts`

Locate the AC-4 test block (around line 155). Add `_resetWatchdogCooldown()` import extraction and call, matching the pattern used in AC-5.

```typescript
// BEFORE (missing reset):
test("AC-4: watchdog detects staleness >6h during market hours", async () => {
  const { priceUpdateWatchdog } = await import(
    "../scheduler/market-data/priceUpdateWatchdogJob.js"
  ).catch(() => ({
    priceUpdateWatchdog: async () => "alert-sent",
  }));
  // ...
});

// AFTER (with reset):
test("AC-4: watchdog detects staleness >6h during market hours", async () => {
  const { priceUpdateWatchdog, _resetWatchdogCooldown } = await import(
    "../scheduler/market-data/priceUpdateWatchdogJob.js"
  ).catch(() => ({
    priceUpdateWatchdog: async () => "alert-sent",
    _resetWatchdogCooldown: () => undefined,
  }));

  // Reset cooldown to allow alert to fire (mirrors AC-5 pattern)
  _resetWatchdogCooldown?.();

  // ... rest of test unchanged ...
});
```

**Verify:** `bun test src/__tests__/240-price-pipeline-recovery.test.ts` → AC-4 passes

---

### Fix D: Diagnose and fix 1551 cross-file state leak

**File:** `apps/mcp-server/src/__tests__/1551-pipeline-watchdog-market-alert.test.ts`

**Step 1: Run in isolation to confirm whether the test passes alone:**
```bash
bun test src/__tests__/1551-pipeline-watchdog-market-alert.test.ts 2>&1 | tail -10
```

**If it passes in isolation:** The failure is cross-file state pollution. The `pipelineWatchdogJob` module is shared across test workers. Fix: ensure the test file resets all relevant state with a top-level `beforeAll` that imports and resets.

**If it fails in isolation:** The test itself has a bug. Check whether `STALE_THRESHOLD_MINS` exported from the module matches the constant expected (currently 90).

**Expected fix (cross-file state):** The `beforeEach` already calls `_resetWatchdogCooldown()`. If that's not enough, the issue is that Bun's parallel test runner shares module instances. Add an explicit import and reset at describe-level:

```typescript
// Add at the top of the describe block (after existing imports):
import { _resetWatchdogCooldown } from "../scheduler/pipelineWatchdogJob.js";

describe("TASK-1551 pipelineWatchdog MARKET alert", () => {
  beforeEach(() => {
    _resetWatchdogCooldown();
  });
  // ... tests unchanged
```

This is already present. If the failure persists, investigate whether Bun workers share module state between `1550-watchdog-market-alert.test.ts` (vpsProxyWatchdogJob) and `1551` (pipelineWatchdogJob). These are different modules — they should NOT share state. Verify that the import in 1551 resolves to `pipelineWatchdogJob` not `vpsProxyWatchdogJob`.

**Alternative root cause:** The `getPipelineHealthFn` mock receives `{ staleMins: 100, today: 0 }` but the code at line 101 destructures `{ staleMins } = health.ragRows`. If `health.ragRows` is undefined at runtime (wrong mock shape), `staleMins` is `undefined`, and `undefined !== null && undefined <= 90` evaluates as `false` — so it would NOT return `"ok"`. It would proceed past the check. This doesn't explain `"ok"`.

**Most likely fix:** Run `1551` in isolation. If it passes, the fix is to add `--serial` flag or ensure Bun runs test files in separate worker contexts. The Bun test configuration file may need to add isolation.

**Verify:** `bun test src/__tests__/1551-pipeline-watchdog-market-alert.test.ts` runs green

---

## Execution Order

1. Apply Fix A (1289c) — no risk, pure assertion removal
2. Apply Fix B (1476) — update test contract to match Sprint 1329
3. Apply Fix C (240 AC-4) — add `_resetWatchdogCooldown` call
4. Diagnose + Apply Fix D (1551) — run in isolation first

---

## Final Verification

```bash
cd apps/mcp-server

# Run all 4 target files:
bun test \
  src/__tests__/1289c-fetcher-validator-integration.test.ts \
  src/__tests__/1476-wal-stuck-alert.test.ts \
  src/__tests__/240-price-pipeline-recovery.test.ts \
  src/__tests__/1551-pipeline-watchdog-market-alert.test.ts \
  2>&1 | tail -10

# Full suite — confirm no new failures:
bun test 2>&1 | grep -E "^\s+[0-9]+ (pass|fail)"
```

**Expected result:** 6934 pass / 0 fail (6927 + 7 fixed)

---

## DDD Layer Compliance

All fixes are in `src/__tests__/` (test layer) or `src/scheduler/` (scheduler layer — outermost, allowed to call infrastructure via injection). No domain layer changes. No SQL changes. No new external dependencies.

---

## Production Footgun Checklist

- No SQL queries modified
- No external HTTP calls added
- No Telegram channel routing changed
- No git `--no-verify` or `--no-gpg-sign`
- Bun post-run C++ panic (`panic(main thread): A C++ exception occurred`) is a known Bun v1.3.11 bug — NOT caused by this change, NOT a blocker

---

## Acceptance Criteria

- [ ] `bun test` shows 6934 pass / 0 fail (or better)
- [ ] `bun tsc --noEmit` exits 0
- [ ] `git diff --stat` shows only `src/__tests__/` files modified (except if Fix D needs scheduler change)
- [ ] QA report filed at `reports/TASK_REPORT_1330.md`
