# Task Report: 1389 — Alert digest mid-quote truncation fix
date: 2026-04-28
outcome: APPROVED

## Test Results
- Unit tests (1300a): 26 passed / 0 failed
- Full suite: 7540 passed / 121 failed (all pre-existing, none related to task)
- TypeScript: 0 errors (after QA fix — see blocking issue below)

## DDD Compliance: PASS
No domain-layer imports from infrastructure or application in changed files.
`telegramMessageFactory.ts` is infrastructure layer — correct placement.

## Security: PASS
No process.env, no hardcoded credentials, no SQL in changed files.

## Issues Found

### Blocking (fixed by QA before merge)
**File:** `apps/mcp-server/src/__tests__/1348a-cascade-brokerage-competitive.test.ts`
**Introduced by:** commit e6884e96 (task 1352, pre-existing in this branch)
**Error:** 5 TSC errors — `as const` applied to nullish-coalescing expressions (TS1355) and `AnalysisLevel`/`DomainType` imports removed, causing TS2322 type mismatches.
**Fix:** Restored `AnalysisLevel` and `DomainType` imports; reverted broken `as const` casts to correct plain assignment (matching main branch pattern). Committed as `639139b4`.

### Non-Blocking
None.

## Manual Verification
`smartTruncate('Vinhomes báo lãi quý 1 hơn 25.600 tỷ, "vô địch"', 40)`
- Input: 47 graphemes (exceeds limit)
- Output: `"Vinhomes báo lãi quý 1 hơn 25.600 tỷ,…"`
- Quote count in result: 0 (no unclosed quote)
- PASS: confirmed

## Merge Status
Merged to main via `merge(1389)` commit. Worktree and branch `worktree-agent-a2cab264` deleted.
TASKS.md: TASK-1389 marked done.
