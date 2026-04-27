# Task 1349a: Remove Dead Scheduler Config

**Sprint:** 1349
**Type:** Code Quality
**Size:** S (0.5h)
**Priority:** LOW

---

## Problem Statement

`mcp.config.json` lines 111–119 contain a "scheduler" section with 7 cron expressions:
- `intelligenceCycle`, `morningBriefing`, `marketOpen`, `marketClose`, `sscCheck`, `eveningSummary`, `predictionMarketPoll`

However, `src/infrastructure/config.ts` (the config loader) never reads this section. The canonical cron source is `src/scheduler/jobs.ts:CRONS` (lines 79–177), which is environment-variable-driven.

**Impact:** Dead code that can confuse developers. If someone updates mcp.config.json thinking it affects runtime, the changes silently have zero effect.

---

## Solution

1. Delete lines 111–119 from `mcp.config.json` (the entire "scheduler" section)
2. Verify no references remain:
   ```bash
   grep -r "scheduler" mcp.config.json | wc -l  # expect 0
   grep -n "scheduler" src/infrastructure/config.ts | wc -l  # expect 0
   ```
3. Run tests:
   ```bash
   bun test --no-coverage 2>&1 | grep -E "^(PASS|FAIL|✓|✗)" | tail -1
   ```
   - Expect: baseline 7371 pass, zero regressions

---

## Acceptance Criteria

- [ ] Lines 111–119 deleted from mcp.config.json
- [ ] `grep scheduler mcp.config.json` returns 0 results
- [ ] No TypeScript or runtime errors
- [ ] Baseline tests still pass (≥7371)

---

## Files Changed

- `mcp.config.json` (deleted lines 111–119)

---

## Notes

- Zero risk change (no code reads deleted config)
- Mechanical cleanup, no logic changes
