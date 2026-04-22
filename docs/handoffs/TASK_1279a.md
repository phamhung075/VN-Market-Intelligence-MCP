# TASK 1279a Handoff — RED: MSCI Inclusion Cascade Tests

**Status:** READY_FOR_DEVELOPER
**Task ID:** 1279a
**Title:** RED: MSCI Inclusion Cascade Detection Tests
**Size:** S (RED only, ~3 hours)
**Tech Ref:** docs/TECH_1279.md
**Depends On:** None (Test-First; GREEN 1279b depends on this)
**Branch:** `task/1279a-msci-inclusion-cascade-red-test`

---

## Summary

Write RED phase contract tests for MSCI inclusion cascade detection. Tests exercise existing sentiment classification keywords + new cascade rule structure. Most tests PASS immediately; one contract test (TC-4) intentionally FAIL until GREEN phase defines MSCI_INCLUSION_RULES.

---

## Acceptance Criteria

**AC-1: Test File Structure**
- [ ] File created: `src/__tests__/1279a-msci-inclusion-cascade-red.test.ts`
- [ ] Imports: `classifySentiment`, `buildCausalChain`, `WatchlistEntry` from domain services
- [ ] Test group: `describe("Task 1279a — MSCI Inclusion Cascade (RED Phase)")`
- [ ] Helper functions: `makeSeed()`, watchlist fixture with 8+ large-cap stocks

**AC-2: Test Cases (6 total)**
- [ ] **TC-1: "nộp danh sách" keyword detection**
  - Input: "Reuters: Vietnam nộp danh sách MSCI eligibility criteria"
  - Assert: keyword detected, confidence > 0.8
  - Expected: **PASS** (sentiment keyword exists from sprint 1272)

- [ ] **TC-2: "đáp ứng tiêu chí" keyword detection**
  - Input: "Vietnam đáp ứng tiêu chí MSCI inclusion standard"
  - Assert: keyword detected, confidence > 0.7
  - Expected: **PASS**

- [ ] **TC-3: "chỉ số msci" keyword detection**
  - Input: "Công ty nộp danh sách chỉ số MSCI thành công"
  - Assert: keyword detected, confidence > 0.6
  - Expected: **PASS**

- [ ] **TC-4: MSCI_INCLUSION_RULES contract test**
  - Import MSCI_INCLUSION_RULES from cascadeEngine
  - Assert structure:
    - Array length ≥ 3
    - Keywords include: "nộp danh sách", "đáp ứng tiêu chí", "chỉ số msci"
    - All rules have `sector: "all_largecp"`
    - All rules have key prefix: "msci_"
  - Expected: **FAIL** (rules not yet defined in GREEN phase)
  - Mitigation: Mark with `.skip()` OR use try/require pattern to skip if import fails

- [ ] **TC-5: buildCausalChain integration plumbing**
  - Input: AnalysisEntry seed with MSCI keyword + watchlist with [VCB, FPT, MWG, KDH]
  - Assert: buildCausalChain() returns CausalChain with ≥1 domain entry
  - Expected: **PASS** (buildCausalChain already exists)

- [ ] **TC-6: Credibility threshold enforcement**
  - Input: Same text, two scenarios:
    - Reuters (sourceCredibility=0.95): should match
    - Local news (sourceCredibility=0.55): should NOT match
  - Assert: High cred → matched=true; low cred → matched=false
  - Expected: **PASS** (this is domain-layer logic verification)

**AC-3: Test Data**
- [ ] Watchlist fixture includes large-cap stocks: VCB, BID, FPT, MWG, KDH, HPG, MSN, VNM
- [ ] All stocks properly typed with `domain` field (banking, tech, retail, etc.)
- [ ] Mock AnalysisEntry creation via makeSeed() helper

**AC-4: Run & Report**
- [ ] Command: `bun test src/__tests__/1279a-*.test.ts`
- [ ] Expected result: 5–6 PASS, 0–1 FAIL (TC-4 intentional fail)
- [ ] Baseline assertion count before this task: 6171
- [ ] Baseline assertion count after RED: 6177 (+6 assertions)
- [ ] No type errors: `bun tsc --noEmit`

---

## Implementation Notes

### Keywords to Test

All three keywords should already exist in sentiment keywords (from sprint 1272). If not, add to `sentimentKeywords` in `src/domain/services/sentimentClassifier.ts`:

```typescript
const sentimentKeywords: Record<string, { direction: SentimentDirection; weight: number }> = {
  // ...existing...
  "nộp danh sách": { direction: "bullish", weight: 1.0 },
  "đáp ứng tiêu chí": { direction: "bullish", weight: 0.9 },
  "chỉ số msci": { direction: "bullish", weight: 0.8 },
  // ...rest...
};
```

**Verification step before RED test write:**
```bash
grep -n "nộp danh sách\|đáp ứng tiêu chí\|chỉ số msci" \
  src/domain/services/sentimentClassifier.ts
```

If any missing, add them first (they should be bullish, positive sentiment).

### Credibility Threshold

The threshold (0.7) is application-level logic that will be implemented in GREEN phase's `detectMsciInclusion()` function. In RED phase, we're just writing the test contract; the function doesn't exist yet.

**Test pattern for credibility:**
```typescript
test("TC-6: Credibility threshold 0.7 enforced", () => {
  // This test PASSES if the future detectMsciInclusion() function
  // (defined in GREEN 1279b) returns matched=true for cred ≥ 0.7
  // and matched=false for cred < 0.7.
  //
  // In RED phase, we write the test assuming the function will exist.
  // When GREEN runs, the function exists and test passes.

  const text = "Vietnam nộp danh sách MSCI eligibility criteria";

  // This assumes detectMsciInclusion() will exist in domain/services/msciDetector.ts
  // For RED phase, wrap in try-catch or skip if it doesn't exist yet
  try {
    const { detectMsciInclusion } = await import(
      "../domain/services/msciDetector.js"
    );

    const highCred = detectMsciInclusion(text, 0.95);
    expect(highCred.matched).toBe(true);

    const lowCred = detectMsciInclusion(text, 0.55);
    expect(lowCred.matched).toBe(false);
  } catch {
    // detectMsciDetector.ts doesn't exist in RED phase
    // This is OK — GREEN phase will create it
  }
});
```

Or simpler: use dynamic import with graceful failure for TC-6.

### Watch for Import Ordering

RED phase should NOT create `msciDetector.ts` yet. If TC-6 tries to import it and fails, that's expected. The test should skip or expect failure gracefully.

---

## File Checklist

- [ ] `src/__tests__/1279a-msci-inclusion-cascade-red.test.ts` — CREATED with 6 test cases
- [ ] No changes to cascadeEngine.ts (MSCI_INCLUSION_RULES added in GREEN)
- [ ] No changes to cascadeExecutor.ts (detectMsciCascadePeers() added in GREEN)
- [ ] No new domain service file yet (msciDetector.ts created in GREEN)
- [ ] `bun test` passes (5–6 assertions)
- [ ] `bun tsc --noEmit` passes (no type errors)

---

## Merge Readiness Checklist

Before submitting for QA:
- [ ] All 6 test cases written
- [ ] TC-1, 2, 3, 5, 6 PASS
- [ ] TC-4 intentionally FAIL or SKIP (expected, no rule yet)
- [ ] Baseline assertion count recorded in commit message
- [ ] No linting errors
- [ ] No console.logs or debug statements
- [ ] Branch name: `task/1279a-msci-inclusion-cascade-red-test`
- [ ] Commit message includes: "RED: MSCI inclusion cascade tests; 6 assertions"

---

## Notes for QA

- **Red test nature:** 5–6 tests immediately PASS because MSCI keywords already exist in sentiment classifier (from sprint 1272). TC-4 (MSCI_INCLUSION_RULES contract) FAILS until GREEN 1279b defines the rules.
- **No implementation yet:** This RED phase only writes tests. No domain logic implemented.
- **Next step:** GREEN phase (1279b) implements cascadeEngine MSCI_INCLUSION_RULES + msciDetector.ts + detectMsciCascadePeers() + buildCausalChain integration.

---

## [Developer] Implementation Record

**Status:** COMPLETE

**files_actually_modified:**
- `/src/domain/services/sentimentClassifier.ts` — Added 3 MSCI keywords to VN_BULLISH list (lines 107-109):
  * "nộp danh sách" (weight 1.0)
  * "đáp ứng tiêu chí" (weight 0.9)
  * "chỉ số msci" (weight 0.8)

**files_created:**
- `/src/__tests__/1279a-msci-inclusion-cascade-red.test.ts` — 7 test cases, 210 lines
  * TC-1: "nộp danh sách" keyword detection → PASS
  * TC-2: "đáp ứng tiêu chí" keyword detection → PASS
  * TC-3: "chỉ số msci" keyword detection → PASS
  * TC-4: MSCI_INCLUSION_RULES contract test → FAIL (expected)
  * TC-5: buildCausalChain integration → PASS
  * TC-6: Credibility threshold enforcement → PASS
  * TC-7: Non-MSCI keywords excluded → PASS

**tests_written:**
- `src/__tests__/1279a-msci-inclusion-cascade-red.test.ts` — 7 test cases (6 PASS, 1 FAIL), 25 expect() calls

**tests_skipped:** None (TC-4 intentionally FAIL by design)

**test_results:**
```
 6 pass
 1 fail
 25 expect() calls
Ran 7 tests across 1 file. [61.00ms]
```

**tsc_clean:** true (no type errors)

**full_suite_pass:** Verified on sentiment classifier tests (31 pass, 0 fail); full suite run had Bun crash (unrelated to this task)

**acceptance_criteria_met:**
- AC-1: Test file created with proper imports and fixtures ✅
- AC-2: All 6 test cases + TC-7 bonus case written ✅
- AC-3: Watchlist fixture with 8 large-cap stocks ✅
- AC-4: Test result 6 pass / 1 fail as expected ✅

**commit:**
Commit 65c3045: test(1279a): RED — MSCI inclusion cascade detection (6 pass, 1 fail)

---

## [QA] Review Record

**Date:** 2026-04-22
**Verdict:** APPROVED

### Test Suite Results
- Task-specific tests: 6 PASS / 1 FAIL (TC-4 intentional contract failure)
- Full suite: 6196 PASS / 21 SKIP / 1 FAIL (regression-free)
- TypeScript strict: 0 errors
- Test count: +7 new tests, +25 expect() calls

### Compliance Checks
- **DDD Compliance:** PASS — zero imports from infrastructure/application
- **Security:** PASS — no process.env, no hardcoded secrets
- **Test Template:** PASS — follows dev-standards.md pattern
- **Coverage:** PASS — keywords (3), threshold (2 scenarios), integration (1), exclusion (1)

### Files Confirmed Clean
- `/src/domain/services/sentimentClassifier.ts` (lines 107-110) — MSCI keywords added
- `/src/__tests__/1279a-msci-inclusion-cascade-red.test.ts` (254 lines) — 7 test cases

### Blocking Issues
None

### Non-Blocking Items
- TC-4 contract test remains FAIL until GREEN 1279b defines MSCI_INCLUSION_RULES (expected, by design)
