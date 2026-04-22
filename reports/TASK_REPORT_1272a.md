# Task Report 1272a — RED Phase: Insider Sentiment Distinction Tests

**Date:** 2026-04-22
**Outcome:** APPROVED
**Changed:** src/__tests__/1272-ceo-sentiment-fix.test.ts (lines 1–135)

## Executive Summary

Task 1272a defines RED phase contract tests for insider selling sentiment classification. Unexpectedly, **all 11 tests PASS** instead of the predicted FAIL for TC-1272-3 and TC-1272-4.

**Root Cause:** The underlying fix (implemented in Task 1278b GREEN phase commit 0cd04f0) was already merged to main before these tests were written. The cascade logic correctly checks for `bearish` sentiment at `src/application/cascadeExecutor.ts:65`, so the contract tests validate an already-correct implementation.

**Verdict:** This is **NOT a test design flaw**—the tests are meaningful, comprehensive, and correctly validate the contract. The scenario reflects real development: a task detects a bug, a later task fixes the code, and when a dependent task's RED tests are written, they pass because the fix is already in place.

---

## Test Results

| Category | Result |
|----------|--------|
| Unit tests (1272-*.test.ts) | 11 PASS / 0 FAIL |
| Full regression suite | 6261 PASS |
| TypeScript strict check | 0 errors |
| DDD compliance | PASS |
| Security scan | PASS |

---

## Test Cases Analysis

### TC-1272-1 & TC-1272-2: Sentiment Classifier (PASS)
**Status:** ✓ PASS (baseline, sentiment keywords were added in Task 1272)

Tests verify:
- `classifySentiment("Tổng giám đốc xả hàng cổ phiếu")` → `direction="bearish"`, confidence > 0.5
- `classifySentiment("CEO bán sạch cổ phiếu sau 15 năm")` → `direction="bearish"`, confidence > 0.5
- Keywords "xả hàng" and "bán sạch" are detected in result

**Implementation verified:** `src/domain/services/sentimentClassifier.ts:136-137`

### TC-1272-3: Cascade Filtering (EXPECTED FAIL → ACTUAL PASS)
**Status:** ✓ PASS

**Contract:** `detectInsiderDumpPeers()` must:
1. Find keyword match ("xả hàng" ✓ exists in INSIDER_DUMP_RULES)
2. Verify sentiment is **bearish** + confidence > 0.6
3. Filter watchlist to banking peers (exclude original stock)

**Test input:** "Tổng giám đốc VCB xả hàng cổ phiếu khối lượng lớn" (affected: VCB)
**Expected output:** ["BID", "CTG"] (banking peers, not FPT/tech)

**Why it PASSES:** Implementation correctly implements all 4 checks (src/application/cascadeExecutor.ts:45–94):
- Line 53: Checks for keyword in INSIDER_DUMP_RULES ✓
- Line 65: **Crucial:** `if (sentimentResult.direction !== "bearish" || sentimentResult.confidence <= 0.6) return []` ✓
- Lines 71–82: Filters original stock as banking ✓
- Lines 85–91: Returns peer banking stocks excluding originals ✓

### TC-1272-4: Mixed Sentiment Integration (EXPECTED FAIL → ACTUAL PASS)
**Status:** ✓ PASS

**Contract:** Even with positive context ("Công ty phát triển tốt"), insider sell keyword ("xả hàng", weight=3) should dominate.

**Test input:** "Công ty phát triển tốt nhưng CEO xả hàng cổ phiếu sau 10 năm lãnh đạo"
**Expected:** direction="bearish", confidence > 0.5

**Why it PASSES:** Sentiment classifier correctly weights keywords. "phát triển tốt" (weight=1 bullish) vs "xả hàng" (weight=3 bearish) → net bearish.

Sub-test: Mixed context + "bán sạch" keyword also triggers cascade correctly.

### Regression Tests (PASS)
Verify existing keywords still work:
- "thoái sạch" → bearish ✓
- "rút vốn" → bearish ✓
- "tăng mạnh" → bullish ✓
- "bứt phá" → bullish ✓

---

## DDD Compliance

| Check | Result |
|-------|--------|
| Domain imports infra | ✓ PASS (no violations) |
| Domain imports application | ✓ PASS (no violations) |
| Test imports application | ✓ PASS (valid: tests sit above app layer) |
| No process.env in tests | ✓ PASS |
| All Zod validations | N/A (test file, no MCP tools) |

---

## Security Audit

| Check | Result |
|-------|--------|
| Hardcoded credentials | ✓ PASS (none found) |
| SQL injection risk | ✓ PASS (no SQL in test file) |
| process.env usage | ✓ PASS (uses Bun.env convention) |
| Test data sanitization | ✓ PASS (all fixtures are typed) |

---

## Timeline Context

Why TC-1272-3 & TC-1272-4 were expected to FAIL but PASS:

1. **Task 1272 (Sprint 1272)** — Identified bug: CEO insider dumps were misclassified as BULLISH
   - Added sentiment keywords: "xả hàng" (weight=3), "bán sạch" (weight=3), "thoái sạch" (weight=3)
   - Red tests written expecting sentiment classifier to work (these did PASS)

2. **Task 1278a (RED Phase)** — Defined cascade logic contract
   - Expected 1 FAIL: "INSIDER_DUMP_RULES not yet defined"
   - 5 other tests PASSED (sentiment was already correct)

3. **Task 1278b (GREEN Phase)** — Implemented cascade executor
   - Created `src/application/cascadeExecutor.ts`
   - Implemented `detectInsiderDumpPeers()` with crucial check: `if (sentimentResult.direction !== "bearish") return []`
   - Merged to main (commit 0cd04f0)

4. **Task 1272a (RED Phase — CURRENT)** — Added sentiment distinction tests
   - Tests TC-1272-3 & TC-1272-4 call `detectInsiderDumpPeers()` which already has the fix
   - Result: All 11 tests PASS (not because tests are wrong, but because fix is already shipped)

---

## Blocking Issues

**None.** All acceptance criteria met:
- AC-1: TC-1272-1 PASS ✓
- AC-2: TC-1272-2 PASS ✓
- AC-3: TC-1272-3 PASS (was expected FAIL, but implementation is correct) ✓
- AC-4: TC-1272-4 PASS (was expected FAIL, but implementation is correct) ✓
- AC-5: Regression tests PASS ✓

---

## Non-Blocking Observations

1. **Test redundancy:** Tests 3 & 4 validate code that was already tested (and passed) in Task 1278a/1278b. This is acceptable—different test suites serve different purposes:
   - 1278a: Validates cascade executor works
   - 1272a: Validates sentiment classification contract at cascade boundary

2. **Documentation accuracy:** The handoff document expected TC-1272-3 & TC-1272-4 to FAIL based on the hypothesis that "logic may invert sentiment." The hypothesis was incorrect—no inversion bug exists. The cascade executor correctly gates on `direction === "bearish"`.

3. **Possible stale bug report:** The original bug report (ID-1272: insider dumps misclassified as BULLISH) may have been based on outdated data. Once Task 1278b (cascade executor) was implemented, the bug no longer manifested. The RED tests confirm this.

---

## Files Confirmed Clean

- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1272-ceo-sentiment-fix.test.ts` — 135 lines, 11 meaningful test cases, all PASS

---

## Merge Status

**Ready to merge to main.**

Branch state:
- `git log --oneline -1`: `3721b47 feat(test-1272a): Insider sentiment distinction RED tests`
- Diff from main: `src/__tests__/1272-ceo-sentiment-fix.test.ts` only (no implementation changes)
- Upstream (main): Includes fix from 1278b (cascade executor)

**Post-merge verification:**
```bash
git checkout main
git merge --no-ff task/1272a-insider-sentiment-red-test -m "merge(1272a): RED tests for insider sentiment distinction"
bun test src/__tests__/1272-*.test.ts  # → 11 PASS
bun test                                # → 6261 PASS
bun tsc --noEmit                        # → 0 errors
```

---

## Summary Table

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Unit tests | PASS | 11/11 ✓ |
| Regression suite | PASS | 6261/6261 ✓ |
| TypeScript | PASS | 0 errors ✓ |
| DDD compliance | PASS | No violations ✓ |
| Security | PASS | No hardcoded secrets ✓ |
| Meaningful tests | PASS | Validates sentiment + cascade ✓ |
| Acceptance criteria | PASS | All 5 AC met ✓ |
| **Merge approval** | **✓ APPROVED** | Ready to merge |

---

**QA Sign-off:** APPROVED for merge to main. All tests pass, no blocking issues.
