# Task Report 1197 — Sentiment Dedup: Covered-Range Lists

**Date:** 2026-04-13
**Branch:** task/1197-sentiment-dedup
**Reviewer:** QA Agent
**Verdict:** PASS

---

## Summary

Task 1197 fixes a double-scoring bug in `sentimentClassifier.ts` where a shorter
substring keyword (e.g. "giảm", weight=1) could match at the same character
position as a longer phrase already scored (e.g. "giảm mạnh", weight=2), inflating
the bearish score by +1 and causing incorrect direction classification.

The fix introduces two covered-range lists (`bullishCovered`, `bearishCovered`)
initialized per `classifySentiment()` call. Before scoring each keyword match, the
algorithm checks whether the match start position falls inside any already-claimed
range. If it does, the match is skipped. Longer phrases are processed first
(sorted by descending word length in `ALL_BULLISH` / `ALL_BEARISH`), so the longer
phrase always claims the range before the substring can.

---

## Acceptance Criteria Verification

| AC | Description | Result |
|----|-------------|--------|
| AC-1 | "lãi suất giảm mạnh, kinh tế phục hồi" → NOT bearish | PASS |
| AC-1 ext | extended version with "mạnh mẽ" → NOT bearish | PASS |
| AC-2 | "thị trường giảm mạnh" → bearish (correct direction preserved) | PASS |
| AC-2 score | over-score guard: "giảm mạnh nhưng phục hồi, tăng nhẹ" → NOT bearish | PASS |
| Negation | "không giảm" → bullish (covered-range does not interfere with negation flip) | PASS |
| Covered | "giảm sâu và giảm mạnh" — two distinct start positions both score independently | PASS |
| No false suppression | "tăng mạnh và tăng trưởng" — different start positions both score | PASS |

---

## Test Results

### Task 1197 tests (`src/__tests__/1197-sentiment-dedup.test.ts`)

```
7 pass / 0 fail
Coverage: sentimentClassifier.ts — 100% funcs, 99.20% lines (line 351 = empty
string early-return, benign)
```

### Regression — Task 134 original tests (`src/__tests__/134-sentiment-classifier.test.ts`)

```
31 pass / 0 fail
Coverage: sentimentClassifier.ts — 100% funcs, 100% lines
```

---

## Integration Checks

### DDD Compliance

- File location: `src/domain/services/sentimentClassifier.ts` — correct layer.
- Zero imports from `infrastructure/` or `application/`. Confirmed by scan.
- Pure function — no async, no I/O, no side effects. Unchanged from task 134
  design.

### TypeScript

`bun tsc --noEmit` — clean, no errors.

### Security

`grep -r "process.env" src/` — all hits are in `__tests__/` (test isolation
setup) and `infrastructure/db/schema.ts` (pre-existing, not introduced by this
task). `sentimentClassifier.ts` itself has zero `process.env` references.

---

## Implementation Notes

Key design decisions:
- `bullishCovered` and `bearishCovered` are local to each `classifySentiment()`
  call — no shared mutable state, function remains pure.
- `isCovered(covered, start)` checks `start >= lo && start < hi`. This correctly
  blocks a substring starting at the same position as a longer phrase, while
  allowing a different phrase that starts after the longer phrase ends.
- The "cancel" negation path (soft negation) still claims the covered range even
  though no score is emitted, preventing a shorter sub-phrase from sneaking in
  a score at that position.
- Negation detection is unaffected: `detectNegation` is called after the
  coverage check but before scoring, so the flip logic continues to work
  correctly for "không giảm" → bullish.

---

## Verdict

All 7 task-specific tests pass. All 31 regression tests pass. TypeScript clean.
DDD clean. No security issues introduced.

**PASS — approved for merge to main.**
