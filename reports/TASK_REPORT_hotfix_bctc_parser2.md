# Task Report: hotfix-bctc-parser2 — BCTC Parser Critical Fixes
date: 2026-04-29
outcome: APPROVED

## Summary

Three critical BCTC extraction bugs fixed: DIG/SHB ticker case mismatch, FPT unit scale
producing quadrillion-scale profit values, and DGC/BSR phantom confidence on effectively
empty extractions.

## Test Results

- Hotfix unit tests: 7 passed / 0 failed (hotfix-bctc-parser2.test.ts)
- Full suite (worktree, pre-merge): 7939 pass / 123 fail — note: worktree was branched
  from main at commit 7070a52f (14 commits behind). The 123 failures were pre-existing
  failures on that older base, not regressions introduced by this hotfix.
- Full suite (main baseline, pre-merge): 8090 pass / 0 fail
- Post-merge hotfix tests on current main: 7 pass / 0 fail (confirmed)
- TypeScript: 0 errors (bun tsc --noEmit clean on worktree branch)

## DDD Compliance: PASS

- `parseBctcReport.ts` (application layer) — no domain→infrastructure imports introduced
- `incomeStatementExtractor.ts` (domain layer) — zero new infrastructure imports
- `bctcReparseJob.ts` (interface/scheduler layer) — no layer violations
- DDD scan of `src/domain/` confirms zero live imports from `infrastructure/`

## Security: PASS

- No `process.env` usage in changed files (only `Bun.env` pattern)
- SQL queries in `bctcReparseJob.ts` remain parameterized with `?` placeholders
- No hardcoded credentials or API keys introduced
- No path traversal risk introduced

## Issues Found

### Blocking
None.

### Non-Blocking
- The worktree was branched 14 commits behind main. The developer's test commit
  (`fix(tests): restore correct PollNewsResult shape`) duplicated fixes already present
  in `4a2a30a2` on main — these were cleanly auto-merged by git with no conflict.

## Bug Fixes Verified

### Bug 1 (CRITICAL): DIG/SHB — ticker code case mismatch
- File: `apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts`
- Fix: `c.toUpperCase()` when building regex pattern; returned `ticker` normalized to uppercase
- Tests: 3 tests covering lowercase "dig", mixed-case "Shb", and idempotent skip when filed

### Bug 2 (CRITICAL): FPT — raw VND x tỷ multiplier producing quadrillions
- File: `apps/mcp-server/src/domain/services/financial-reports/incomeStatementExtractor.ts`
- Fix: magnitude inference guard now fires for any multiplier when `netRevenue * m > 1e14`
  (physically impossible for any VN listed company); original `m === 1` branch kept as fallback
- Tests: 2 tests — quadrillion guard + normal tỷ case still scales correctly

### Bug 3 (HIGH): DGC/BSR — phantom confidence on zero-core data
- File: `apps/mcp-server/src/application/usecases/parseBctcReport.ts`
- Fix: zero-core guard caps confidence at 0.05 when `totalAssets=0 AND netRevenue=0 AND netProfit=0`
- BSR test confirms confidence = 0.05 (triggers low_confidence flag correctly)
- Tests: 2 tests — BSR zero-core cap + DGC normal confidence not capped

## Merge Status

Merged to main as commit `1890fead` via `--no-ff`.
Branch `worktree-agent-a1e01646` deleted. Worktree removed.
