# TASK 1272a — RED Phase: Insider Selling Sentiment Distinction Tests

**Sprint:** 1272 | **Size:** S (TDD single task) | **Baseline:** 6189 | **Target:** +4 RED assertions
**Layer:** test | **Status:** Ready for Dev

## Problem Statement

**Bug**: Insider selling articles (CEO dumping shares — "xả hàng", "bán sạch", "thoái sạch") are classified as **BULLISH** instead of **BEARISH**. This causes:
- False alert cascades to banking peers (treating dump as buying signal)
- Misguided watchlist notifications (user sees dump as positive)
- Revenue leakage (wrong cascade triggered for wrong reason)

**Root Cause** (hypothesis to validate in RED phase):
- sentimentClassifier.ts correctly labels sell keywords as bearish (weight=3)
- But cascade logic or news processing inverts sentiment or applies wrong rule
- Possible: mismatch between "insider dump" context vs "insider buying" context in cascade firing

## Test Contract (RED Phase)

All tests are **FAILING** until GREEN phase fixes the underlying logic.

### TC-1272-1: Sentiment classifier marks "xả hàng" as BEARISH (should already PASS from sprint 1272 base)

```typescript
import { classifySentiment } from "../domain/services/sentimentClassifier.js";

test("1272-1: xả hàng keyword alone triggers bearish sentiment", () => {
  const result = classifySentiment("Tổng giám đốc xả hàng cổ phiếu");
  expect(result.direction).toBe("bearish");
  expect(result.keywords).toContain("xả hàng");
  expect(result.confidence).toBeGreaterThan(0.5);
});
```

**Status**: PASS (classifier is already correct, sprint 1272 added keywords)

### TC-1272-2: Sentiment classifier marks "bán sạch" as BEARISH (should already PASS from sprint 1272 base)

```typescript
test("1272-2: bán sạch keyword triggers bearish sentiment", () => {
  const result = classifySentiment("CEO bán sạch cổ phiếu sau 15 năm");
  expect(result.direction).toBe("bearish");
  expect(result.keywords).toContain("bán sạch");
  expect(result.confidence).toBeGreaterThan(0.5);
});
```

**Status**: PASS (classifier is already correct)

### TC-1272-3: detectInsiderDumpPeers() respects sentiment direction (should FAIL — logic may invert sentiment)

```typescript
import { detectInsiderDumpPeers } from "../application/cascadeExecutor.js";
import type { WatchlistEntry } from "../domain/services/cascadeEngine.js";

test("1272-3: detectInsiderDumpPeers requires BEARISH sentiment (reject bullish misclassification)", () => {
  const watchlist: WatchlistEntry[] = [
    { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
    { actionCode: "BID", domain: "banking", exchange: "HOSE" },
    { actionCode: "CTG", domain: "banking", exchange: "HOSE" },
  ];

  // Article with sell keyword: "xả hàng" → must be bearish, must trigger cascade
  const peers = detectInsiderDumpPeers(
    "Tổng giám đốc VCB xả hàng cổ phiếu khối lượng lớn",
    ["VCB"],
    watchlist,
  );

  // Cascade should fire because sentiment is bearish + keyword matches
  expect(peers.length).toBeGreaterThan(0);
  expect(peers).toContain("BID");
  expect(peers).toContain("CTG");
  expect(peers).not.toContain("VCB"); // No circular
});
```

**Status**: FAIL (if sentiment is inverted, peers list will be empty)

### TC-1272-4: Mixed sentiment text with sell keyword remains BEARISH (integration contract)

```typescript
test("1272-4: Mixed bullish/bearish text with xả hàng = net BEARISH", () => {
  const result = classifySentiment(
    "Công ty phát triển tốt nhưng CEO xả hàng cổ phiếu sau 10 năm lãnh đạo"
  );

  // Even with "phát triển tốt" (positive), xả hàng (weight=3) should dominate
  expect(result.direction).toBe("bearish");
  expect(result.confidence).toBeGreaterThan(0.5);
  expect(result.keywords).toContain("xả hàng");
});
```

**Status**: FAIL (if sentiment is inverted, this test may pass with wrong direction)

## Acceptance Criteria (RED → GREEN transition)

| # | Acceptance Criterion | Current Status |
|----|-----|---------|
| AC-1 | TC-1272-1 PASS: Sentiment classifier marks "xả hàng" bearish | PASS ✓ |
| AC-2 | TC-1272-2 PASS: Sentiment classifier marks "bán sạch" bearish | PASS ✓ |
| AC-3 | TC-1272-3 FAIL → PASS after fix: detectInsiderDumpPeers cascade fires on bearish sell | FAIL → TODO |
| AC-4 | TC-1272-4 FAIL → PASS after fix: Mixed text + sell keyword = net bearish | FAIL → TODO |
| AC-5 | No regression: Existing bullish keywords still work (tăng mạnh, bứt phá) | PASS ✓ |

## Files Involved

| File | Role | Status |
|------|------|--------|
| `src/__tests__/1272-ceo-sentiment-fix.test.ts` | Already exists with basic sentiment tests | **Update** |
| `src/domain/services/sentimentClassifier.ts` | Keyword definitions (bearish sell keywords already added) | **No change** |
| `src/application/cascadeExecutor.ts` | detectInsiderDumpPeers logic (where bug likely is) | **Review in GREEN** |
| `src/__tests__/1278a-insider-dump-cascade-red.test.ts` | Cascade RED tests (already written) | **Review** |

## Red Phase Strategy

1. Verify that `classifySentiment("xả hàng ...")` returns `direction="bearish"` (should already pass from sprint 1272)
2. Add TC-1272-3 and TC-1272-4 to the test suite (will FAIL)
3. Commit test file with FAILING tests
4. Dev team investigates why detectInsiderDumpPeers returns empty peers or wrong sentiment in GREEN phase

## Expected FAIL Reason

If tests TC-1272-3 and TC-1272-4 FAIL:
- Hypothesis A: `classifySentiment()` returns `bullish` instead of `bearish` (sentiment inverted somewhere)
- Hypothesis B: `detectInsiderDumpPeers()` has inverted condition logic (checks `direction === "bullish"` instead of `"bearish"`)
- Hypothesis C: INSIDER_DUMP_RULES rule is being applied after sentiment was already set to bullish from another code path

Green phase will diagnose and fix root cause.

## Notes

- This is a **regression bug** — insider selling should have been correctly classified from the beginning
- Sprint 1272 **base** added sentiment keywords, but didn't fully wire the cascade logic
- Sprint 1278 implemented the cascade executor, but may have introduced the inversion bug
- Test file structure mirrors 1278a/1278b pattern: RED = contract definition, GREEN = implementation verification

---

## [QA] Review Record

**Date:** 2026-04-22
**Verdict:** APPROVED
**Task Report:** reports/TASK_REPORT_1272a.md

### Test Suite Results
- bun test src/__tests__/1272-*.test.ts: **11 PASS / 0 FAIL** ✓
  - TC-1272-1: Sentiment classifier marks "xả hàng" as BEARISH ✓ PASS
  - TC-1272-2: Sentiment classifier marks "bán sạch" as BEARISH ✓ PASS
  - TC-1272-3: detectInsiderDumpPeers respects sentiment direction ✓ PASS
  - TC-1272-4: Mixed sentiment with sell keyword remains BEARISH ✓ PASS
  - 3 regression tests: Existing keywords still work ✓ PASS
- bun test (full regression): **6261 PASS** ✓
- bun tsc --noEmit: **0 errors** ✓

### Compliance Checks
- **DDD Compliance:** PASS — no cross-layer violations
- **Security:** PASS — no hardcoded credentials, no process.env
- **TypeScript:** PASS — strict mode, 0 type errors

### Critical Finding

Tests TC-1272-3 & TC-1272-4 were expected to FAIL (contract tests) but PASS because:
- Task 1278b (GREEN phase, commit 0cd04f0) already implemented the fix to `detectInsiderDumpPeers()`
- The cascade executor correctly checks for `direction === "bearish"` at line 65
- No inversion bug exists; the contract is already satisfied

**This is not a test design flaw.** The tests are meaningful and correctly validate the contract. The situation reflects real development: a bug is identified, a later task fixes it, and dependent tests written afterward see the fixed code.

### Files Confirmed Clean
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1272-ceo-sentiment-fix.test.ts` (135 lines, 11 test cases)

### Blocking Issues
None — all acceptance criteria met.

### Non-Blocking Notes
1. Test redundancy with Task 1278a/1278b is acceptable (different test suites, different purposes)
2. Original bug hypothesis (sentiment inversion) appears stale — no such bug exists in current code
3. Possible that original bug report was based on outdated data when VPS was down

### Merge Status
**APPROVED FOR MERGE TO MAIN**

All acceptance criteria met:
- AC-1: TC-1272-1 PASS ✓
- AC-2: TC-1272-2 PASS ✓
- AC-3: TC-1272-3 PASS ✓
- AC-4: TC-1272-4 PASS ✓
- AC-5: Regression PASS ✓

**merge_commit:** aa5bd3b
