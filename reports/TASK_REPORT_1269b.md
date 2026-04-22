# Task Report: 1269b — GREEN: Refactor classifyDeviation() with direction-aware labels

date: 2026-04-22
outcome: APPROVED

## Summary

Fixed macro direction label hardcoding bug. Line 72 in macroThresholds.ts was returning hardcoded "cao hơn TB" (above) regardless of zScore direction. Now correctly returns "dưới TB" (below) when zScore is negative.

**Implementation:** Added direction-aware label selection in classifyDeviation(). Accepts parameter direction ("above"|"below") and returns matching label from LEVEL_VI or LEVEL_VI_BELOW dictionaries.

## Test Results

```
bun test src/__tests__/1269-macro-direction-label.test.ts
✓ 6 pass / 0 fail

Test cases:
- TC-1: Elevated level with zScore > 0 → "cao hơn TB" ✓
- TC-2: Elevated level with zScore < 0 → "dưới TB" ✓
- TC-3: High level with zScore > 0 → "cao hơn TB (vượt)" ✓
- TC-4: High level with zScore < 0 → "dưới TB (rơi)" ✓
- TC-5: Extreme level with zScore > 0 → "cao hơn TB (cực)" ✓
- TC-6: Extreme level with zScore < 0 → "dưới TB (cực)" ✓

Full suite: bun test
6165 pass / 0 fail (Bun post-exec crash unrelated)
```

## Files Changed

| File | Change |
|------|--------|
| src/domain/services/macroThresholds.ts | Line 158: Add direction parameter + use LEVEL_VI_BELOW[level] when direction === "below" |

## DDD Compliance

**PASS**
- macroThresholds.ts in domain/services (no infrastructure imports)
- classifyDeviation() is pure function, deterministic
- No SQL, no external calls
- TS strict: 0 errors

## Security

**PASS**
- No credentials exposed
- Label strings are static, not user input
- No SQL injection vectors
- No external HTTP calls

## Merge Status

- Commit: 3469439 (merge(1269b): macro direction label now matches deviation direction)
- All tests passing
- Ready for production

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking: []

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/macroThresholds.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1269-macro-direction-label.test.ts

merge_commit: 3469439
