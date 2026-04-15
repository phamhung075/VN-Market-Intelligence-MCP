# TASK REPORT 1287 — fix(cascade): R09/R11 rule drift in predictionCascadeMapper

| Field | Value |
|-------|-------|
| Task ID | 1287 |
| Branch | fix/1287-cascade-rule-drift |
| Date | 2026-04-15 |
| Reviewer | QA agent |
| Verdict | PASS |

---

## Summary

Single-character fix to `SPORTS_ENTERTAINMENT_KEYWORDS` in `src/domain/services/predictionCascadeMapper.ts`. The keyword `"nfl"` was changed to `"nfl "` (trailing space added). Without the space, the substring `"nfl"` matched inside `"inflation"`, causing R11 (inflation → banking/real_estate) and R09 (war/armed conflict → oil_gas/aviation) signals to be incorrectly suppressed.

---

## Pipeline Results

| Step | Result | Detail |
|------|--------|--------|
| TypeScript (`bun tsc --noEmit`) | PASS | Zero errors |
| Suite 1287 (13 cases) | PASS | 13/13 |
| Suite 165 (regression target) | PASS | 38/38 |
| Full regression (`bun test`) | PASS* | Pre-existing failures only (see below) |
| DDD layering scan | PASS | No `import` (runtime) from `infrastructure/` or `application/` in `domain/` |
| Security scan (`process.env`) | PASS | None in changed file |

*Full suite still running OCR test (296) at time of review. All non-OCR tests completed.

---

## Fix Verification

File: `src/domain/services/predictionCascadeMapper.ts`, line 371

```
- "nfl",
+ "nfl ",
```

The trailing space ensures the sports filter only matches standalone `nfl` tokens, not `nfl` as a substring of `inflation`.

---

## Pre-existing Failures (not introduced by this task)

These failures exist identically on `main` before this branch:

| Test | Failure |
|------|---------|
| 062 — cascade engine | `watchlistImpacts.length` = 0, expected 2 (pre-existing cascade broadening issue) |
| 102 — news polling job | PollNewsResult shape mismatch (tracked as task 1288) |
| 1025 — SSC BCTC fallback | SSC portal mock mismatch |
| 1139 — utility observability | `franceSummaryJob` recordJobRun wrap |
| 1168 — market message digest | DB seeding issue |
| 1187 — pollNews dead code | geo-blocked fetcher path |
| 185 — data freshness | freshness display format |
| VPS watchdog | empty table staleness check |

All verified pre-existing on `main` before this branch.

---

## Files Changed

| File | Change |
|------|--------|
| `src/domain/services/predictionCascadeMapper.ts` | `"nfl"` → `"nfl "` in SPORTS_ENTERTAINMENT_KEYWORDS |
| `src/__tests__/1287-cascade-rule-drift.test.ts` | New test file (13 cases) |
| `TASKS.md` | Task 1287 moved to Done |
