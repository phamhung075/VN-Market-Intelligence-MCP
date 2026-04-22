# TASK 125 — fix(test-125): timezone-dependent 1h offset in briefing test

## TLDR

- **What:** Replace timezone-dependent `Date.now()` with explicit Vietnam midnight calculation
- **Where:** `src/__tests__/125-test-e2e-briefing.test.ts:1154` (1 line changed)
- **Why:** Test seeds RAG row with `Date.now()` but timezone math fails when test runs late UTC and 1h-ago timestamp falls before midnight Vietnam time
- **Solution:** Calculate midnight Vietnam as UTC + 7h offset, add 1h buffer to ensure timestamp always after Vietnam midnight

## Acceptance Criteria

- CHANGED: `src/__tests__/125-test-e2e-briefing.test.ts:1145-1156` (comment + timestamp logic)
- `bun test src/__tests__/125-test-e2e-briefing.test.ts` — 39 pass / 0 fail
- `bun test` — full suite 6124 pass / 0 fail
- `bun tsc --noEmit` — 0 errors

## Implementation Record

files_actually_modified:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/125-test-e2e-briefing.test.ts` (lines 1145-1156)
  - Replaced `const recentTimestamp = new Date(Date.now()).toISOString();`
  - With explicit `midnightVietnamUtc()` helper + 1h buffer: `const midnightUtc = new Date(midnightVietnamUtc()); const recentTimestamp = new Date(midnightUtc.getTime() + 3600_000).toISOString();`
  - Updated comment to clarify the 1h buffer ensures deterministic behavior

tests_written: 0 (fix validation only)

tests_skipped: []

tsc_clean: true
full_suite_pass: true
baseline: 6119 tests
result: 6124 tests (5 new in unrelated modules)

## Root Cause

The test comment claimed `Date.now()` ensures row is "always within today's Vietnam date" but this is false:
- When test runs at 23:30 UTC, that's 06:30 next day Vietnam time
- But assembleBriefing queries `created_at >= midnightVietnamAsUtc()` which is 7h earlier
- If the 1h-ago timestamp (22:30 UTC) falls before Vietnam midnight (17:00 UTC), the row is excluded
- This race condition occurs during late UTC test runs

## Solution Details

1. Use existing `midnightVietnamUtc()` helper already in test file (line 246)
2. Add 3600_000ms (1 hour) buffer to ensure timestamp is always after Vietnam midnight
3. This guarantees deterministic behavior regardless of when test runs

## Git Commit

```
26b8310 fix(test-125): timezone-dependent 1h offset in briefing test
```

---

## [QA] Review Record

**Date:** 2026-04-22
**Verdict:** APPROVED

### Test Suite Results
- bun test: 6165 PASS / 21 SKIP / 0 FAIL (6165 tests across 508 files, 39.96s)
- bun tsc --noEmit: 0 errors
- Task-specific test (125-test-e2e-briefing.test.ts): PASS

### Files Confirmed Clean
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/125-test-e2e-briefing.test.ts` — timezone fix in place (line 1154, midnightVietnamUtc() + 1h buffer)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/market-data/ohlcvDailyAggregatorJob.ts` — guard checks implemented (lines 103-112, optional chaining + skippped ticker on undefined)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/agents/ops.md` — Ops agent file present (8.1 KB, full metadata + workflow docs)

### Compliance Checks
- **DDD Layer Integrity:** PASS — no violations (domain→application→interface→scheduler direction only)
- **TypeScript Strict:** PASS — 0 type errors
- **Security:** PASS — no process.env usage in src/domain or src/infrastructure
- **Merge Conflict Resolution:** PASS — reports/2026-04-22-evening.json kept main version (valid)

### Commits Validated
- ff55779: fix(ohlcvDailyAggregatorJob) — guard checks lines 103-112 ✓
- fb27186: feat(ops) — agent + metadata audit + 1498 insertions ✓
- 26b8310: fix(test-125) — timezone buffer fix ✓

### Blocking Issues
None — all acceptance criteria met.

### Merge Status
**MERGED TO MAIN** — all three commits present in ancestry of HEAD (main)
- Verified: git merge-base --is-ancestor for all three commits returns true
- Test baseline stable: 6165 pass (no regression)

**merge_commit:** 91ec866 (integration of main into task/125 prior to final merge)
